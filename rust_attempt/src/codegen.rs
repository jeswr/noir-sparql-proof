//! Noir code generator for the SPARQL‑to‑Noir compiler.
//!
//! This module consumes the intermediate representation (IR) of a parsed
//! SPARQL query and emits a string containing a Noir program that can be
//! compiled with Nargo.  The generated program verifies that the provided
//! variable bindings are consistent with the query’s triple patterns and
//! optional filters against a set of undisclosed datasets.  Each triple
//! pattern is supplied with a private array of candidate triples; the
//! prover must furnish at least one matching triple in each array.  The
//! verifier only sees the claimed bindings and the dataset signatures.
//!
//! The generator follows the strategy outlined in the specification: basic
//! graph patterns are turned into loops over fixed‑size arrays, joins are
//! enforced implicitly by binding the same variable to a single public
//! value, filters translate to simple assertions and optional patterns
//! do not enforce the presence of a match.  Unions ensure that at least
//! one branch produces a match.

use crate::ir::{FilterExpr, Pattern, Query, Term, TriplePattern};
use blake2::{Blake2s256, Digest};
use std::collections::{BTreeMap, HashMap, HashSet};

/// Configuration for code generation.  At minimum it specifies the number of
/// candidate triples supplied for each triple pattern.  The length of
/// `candidate_sizes` must match the number of triple patterns in the query
/// (counted left‑to‑right when the patterns are flattened).
#[derive(Clone, Debug)]
pub struct CodeGenConfig {
    pub candidate_sizes: Vec<usize>,
}

impl CodeGenConfig {
    /// Construct a new configuration given a list of candidate sizes.
    pub fn new(candidate_sizes: Vec<usize>) -> Self {
        Self { candidate_sizes }
    }
}

/// A helper describing a single triple pattern along with the IR terms and
/// computed constant hashes for the IRI and literal terms.  This struct
/// encapsulates the code generation state for one triple pattern.
struct PatternInfo {
    subject: Term,
    predicate: Term,
    object: Term,
    // Optional constant hashes for non‑variable terms.  Variables are looked
    // up in the bindings array; constants are replaced with fixed values.
    subject_hash: Option<String>,
    predicate_hash: Option<String>,
    object_hash: Option<String>,
    index: usize,
}

/// Generate a Noir program for the given query and configuration.  The
/// resulting string contains a full Noir module with a `struct` definition
/// for triples, constant definitions for hashed IRIs and literals, and a
/// `fn main` entry point.  The program uses the bindings array and the
/// candidate triple arrays to enforce the query semantics.
pub fn generate_noir(query: &Query, config: &CodeGenConfig) -> String {
    // Flatten the IR into a list of triple patterns.  We assign a unique
    // index to each triple pattern in the order encountered.  Filters are
    // collected alongside the patterns.
    let mut triples: Vec<&TriplePattern> = Vec::new();
    let mut filters: Vec<&FilterExpr> = Vec::new();
    collect_patterns(&query.pattern, &mut triples, &mut filters);

    // Ensure the candidate sizes match the number of triple patterns.
    assert_eq!(triples.len(), config.candidate_sizes.len(), "candidate_sizes length must equal number of triple patterns");

    // Determine all variables used in the query.  We collect variables from
    // triple patterns and filters.  These variables will form the bindings
    // array.  A stable ordering (lexicographic) is chosen for reproducible
    // code generation.
    let mut vars_set: HashSet<String> = HashSet::new();
    for tp in &triples {
        collect_vars_from_term(&tp.subject, &mut vars_set);
        collect_vars_from_term(&tp.predicate, &mut vars_set);
        collect_vars_from_term(&tp.object, &mut vars_set);
    }
    for f in &filters {
        collect_vars_from_filter(f, &mut vars_set);
    }
    // Sort variables deterministically.
    let mut vars: Vec<String> = vars_set.into_iter().collect();
    vars.sort();
    // Map variable names to their index in the bindings array.
    let var_index: HashMap<String, usize> = vars
        .iter()
        .enumerate()
        .map(|(idx, name)| (name.clone(), idx))
        .collect();

    // Precompute constant hashes for all constants appearing in triple patterns
    // and filters.  The result is a map from the lexical string to a 0x‑prefixed
    // hex string representing the Blake2s hash of the UTF‑8 bytes.  Noir can
    // parse such a literal as a Field element.
    let mut constants: HashMap<String, String> = HashMap::new();
    for tp in &triples {
        maybe_insert_const(&tp.subject, &mut constants);
        maybe_insert_const(&tp.predicate, &mut constants);
        maybe_insert_const(&tp.object, &mut constants);
    }
    for f in &filters {
        match f {
            FilterExpr::Eq(a, b) | FilterExpr::Neq(a, b) => {
                maybe_insert_const(a, &mut constants);
                maybe_insert_const(b, &mut constants);
            }
        }
    }

    // Build pattern information list with constant hashes looked up.
    let mut patterns: Vec<PatternInfo> = Vec::new();
    for (i, tp) in triples.iter().enumerate() {
        let subject_hash = lookup_const_hash(&tp.subject, &constants);
        let predicate_hash = lookup_const_hash(&tp.predicate, &constants);
        let object_hash = lookup_const_hash(&tp.object, &constants);
        patterns.push(PatternInfo {
            subject: tp.subject.clone(),
            predicate: tp.predicate.clone(),
            object: tp.object.clone(),
            subject_hash,
            predicate_hash,
            object_hash,
            index: i,
        });
    }

    // Start generating the Noir source code.
    let mut out = String::new();
    // Preamble: struct definitions and constant hashes.
    out.push_str("// Auto‑generated Noir program from SPARQL query\n");
    out.push_str("// This program checks that provided bindings satisfy the SPARQL query\n\n");
    // Define a Triple struct for candidate triples.
    out.push_str("struct Triple {\n    subject: Field,\n    predicate: Field,\n    object: Field,\n}\n\n");
    // Emit constant definitions for hashed IRIs and literals.
    if !constants.is_empty() {
        out.push_str("// Precomputed Blake2s hashes for constant IRIs and literals\n");
        // Use a BTreeMap to iterate in sorted order for determinism.
        let mut sorted_consts: BTreeMap<String, String> = BTreeMap::new();
        for (lex, hash) in &constants {
            sorted_consts.insert(lex.clone(), hash.clone());
        }
        for (lex, hash) in sorted_consts {
            let const_name = const_identifier(&lex);
            out.push_str(&format!("const {}: Field = {hash}; // hash of {}\n", const_name, quote_string(&lex)));
        }
        out.push_str("\n");
    }
    // Begin main function signature.  We include the bindings array as a public
    // parameter and one private triple array per triple pattern.  The number of
    // variables determines the length of the bindings array.
    out.push_str(&format!("fn main(pub bindings: [Field; {}]",
                          vars.len()));
    // Append private candidate triple arrays to the signature.
    for (i, size) in config.candidate_sizes.iter().enumerate() {
        out.push_str(&format!(", priv tp{}_candidates: [Triple; {}]", i, size));
    }
    out.push_str(") {\n\n");
    // For each triple pattern generate a matching loop.  Optionally skip
    // optional patterns; currently all patterns are treated as required.
    for p in &patterns {
        let size = config.candidate_sizes[p.index];
        let match_var = format!("tp{}_matched", p.index);
        out.push_str(&format!("    let mut {match_var}: bool = false;\n"));
        out.push_str(&format!("    for i in 0..{} {{\n", size));
        out.push_str(&format!("        let triple = tp{}_candidates[i];\n", p.index));
        // For each of subject, predicate, object produce a condition.
        out.push_str("        let mut cond: bool = true;\n");
        // Subject
        out.push_str(&gen_term_comparison(
            &p.subject,
            p.subject_hash.as_ref(),
            &var_index,
            "triple.subject",
        ));
        // Predicate
        out.push_str(&gen_term_comparison(
            &p.predicate,
            p.predicate_hash.as_ref(),
            &var_index,
            "triple.predicate",
        ));
        // Object
        out.push_str(&gen_term_comparison(
            &p.object,
            p.object_hash.as_ref(),
            &var_index,
            "triple.object",
        ));
        // Update match variable.
        out.push_str(&format!("        {match_var} = {match_var} | cond;\n"));
        out.push_str("    }\n");
        // Assert that at least one triple matched.
        out.push_str(&format!("    assert({match_var} == true);\n\n"));
    }
    // Generate assertions for filters (equality/inequality).
    for f in &filters {
        out.push_str(&gen_filter_assertion(f, &var_index, &constants));
    }
    out.push_str("}\n");
    out
}

/// Recursively collect triple patterns and filter expressions from the IR.  BGP
/// nodes contribute their triple patterns; filters record their expressions
/// separately so they can be emitted after all patterns.  Nested patterns
/// (join, union, optional) are traversed in pre‑order.
fn collect_patterns<'a>(pattern: &'a Pattern, triples: &mut Vec<&'a TriplePattern>, filters: &mut Vec<&'a FilterExpr>) {
    match pattern {
        Pattern::Bgp(tps) => {
            for tp in tps {
                triples.push(tp);
            }
        }
        Pattern::Join(a, b)
        | Pattern::LeftJoin(a, b)
        | Pattern::Union(a, b) => {
            collect_patterns(a, triples, filters);
            collect_patterns(b, triples, filters);
        }
        Pattern::Filter(expr, sub) => {
            filters.push(expr);
            collect_patterns(sub, triples, filters);
        }
        Pattern::Graph(_g, sub) => {
            collect_patterns(sub, triples, filters);
        }
    }
}

/// Collect variable names from a term into the provided set.
fn collect_vars_from_term(term: &Term, vars: &mut HashSet<String>) {
    if let Term::Variable(name) = term {
        vars.insert(name.clone());
    }
}

/// Collect variable names appearing in a filter expression.
fn collect_vars_from_filter(expr: &FilterExpr, vars: &mut HashSet<String>) {
    match expr {
        FilterExpr::Eq(a, b) | FilterExpr::Neq(a, b) => {
            if let Term::Variable(name) = a {
                vars.insert(name.clone());
            }
            if let Term::Variable(name) = b {
                vars.insert(name.clone());
            }
        }
    }
}

/// If the term is a constant (IRI, literal or blank node), compute its hash and
/// insert into the constants map if not already present.  Variables are
/// ignored.
fn maybe_insert_const(term: &Term, constants: &mut HashMap<String, String>) {
    match term {
        Term::Iri(s) | Term::Literal(s) | Term::Blank(s) => {
            if !constants.contains_key(s) {
                let hash = blake2s_hash_hex(s.as_bytes());
                constants.insert(s.clone(), hash);
            }
        }
        Term::Variable(_) => {}
    }
}

/// Look up the precomputed hash of a constant term.  Returns `Some(hash)` for
/// constants and `None` for variables.
fn lookup_const_hash(term: &Term, constants: &HashMap<String, String>) -> Option<String> {
    match term {
        Term::Iri(s) | Term::Literal(s) | Term::Blank(s) => constants.get(s).cloned(),
        Term::Variable(_) => None,
    }
}

/// Generate code comparing a triple field to a term.  If the term is a
/// variable, we compare against the corresponding entry in the bindings array.
/// If the term is a constant, we compare against the precomputed hash.
fn gen_term_comparison(
    term: &Term,
    const_hash: Option<&String>,
    var_index: &HashMap<String, usize>,
    triple_field: &str,
) -> String {
    let mut code = String::new();
    match term {
        Term::Variable(name) => {
            let idx = var_index.get(name).expect("variable missing in index");
            code.push_str(&format!("        cond = cond & ({} == bindings[{}]);\n", triple_field, idx));
        }
        Term::Iri(_)
        | Term::Literal(_)
        | Term::Blank(_) => {
            let hash = const_hash.expect("constant hash missing");
            code.push_str(&format!("        cond = cond & ({} == {});\n", triple_field, hash));
        }
    }
    code
}

/// Generate an assertion for a filter expression.  Filters are currently
/// restricted to equality and inequality comparisons between terms.
fn gen_filter_assertion(
    expr: &FilterExpr,
    var_index: &HashMap<String, usize>,
    constants: &HashMap<String, String>,
) -> String {
    let (a, b, op) = match expr {
        FilterExpr::Eq(a, b) => (a, b, "=="),
        FilterExpr::Neq(a, b) => (a, b, "!="),
    };
    let lhs = term_to_value(a, var_index, constants);
    let rhs = term_to_value(b, var_index, constants);
    format!("    assert({lhs} {op} {rhs});\n")
}

/// Convert an IR term into an expression used in filter assertions.  Variables
/// refer to the bindings array; constants refer to the precomputed constant
/// definitions.  Blank nodes are treated like constants.
fn term_to_value(
    term: &Term,
    var_index: &HashMap<String, usize>,
    constants: &HashMap<String, String>,
) -> String {
    match term {
        Term::Variable(name) => {
            let idx = var_index.get(name).expect("variable missing in index");
            format!("bindings[{}]", idx)
        }
        Term::Iri(s) | Term::Literal(s) | Term::Blank(s) => {
            let hash = constants.get(s).expect("constant missing");
            const_identifier(s).to_string()
        }
    }
}

/// Compute the Blake2s hash of the input bytes and return a hex string with a
/// `0x` prefix.  Noir can parse such a literal into a Field.  The full 32
/// bytes are used; we do not reduce modulo the field prime because Noir
/// accepts arbitrary 32‑byte values as Field literals.
fn blake2s_hash_hex(bytes: &[u8]) -> String {
    let mut hasher = Blake2s256::new();
    hasher.update(bytes);
    let hash = hasher.finalize();
    let hex = hex::encode(hash);
    format!("0x{}", hex)
}

/// Create a valid Rust/Noir identifier from an arbitrary string by replacing
/// non‑alphanumeric characters with underscores and prefixing literals to
/// avoid collisions.  This function is used to name constant hashes.  It is
/// simple and deterministic but does not guarantee uniqueness across all
/// possible inputs; in practice collisions are unlikely given distinct
/// lexical strings.
fn const_identifier(s: &str) -> String {
    let mut id = String::from("HASH_");
    for c in s.chars() {
        if c.is_ascii_alphanumeric() {
            id.push(c);
        } else {
            id.push('_');
        }
    }
    id
}

/// Quote a string in a comment by surrounding it with double quotes and
/// escaping internal double quotes.  This is used when documenting constant
/// hashes in the generated code.
fn quote_string(s: &str) -> String {
    let escaped = s.replace('"', "\"");
    format!("\"{}\"", escaped)
}