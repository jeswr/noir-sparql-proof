# Design Document

## Overview

The SPARQL to Noir circuit compiler is designed as a modular pipeline that transforms SPARQL 1.1 queries into zero-knowledge circuits using Noir's recursive proof capabilities. The system follows a multi-stage compilation approach: parsing SPARQL into an intermediate representation (IR), performing semantic analysis and optimization, encoding RDF terms as field elements, planning membership proofs, and finally generating Noir code.

The architecture leverages Noir's recursive proof system to handle arbitrary path lengths and multiple datasets by decomposing complex queries into smaller, verifiable components that can be composed recursively. This enables support for unbounded property paths and an arbitrary number of input datasets while maintaining circuit efficiency.

The architecture emphasizes modularity, auditability, and extensibility. Each compilation stage is implemented as a pure function that transforms input data structures without side effects, making the system easier to test, debug, and extend.

## Architecture

### High-Level Pipeline

```
SPARQL Query → Parser → Path Decomposer → Analyzer → IR Builder → Term Encoder → 
Circuit Planner → Recursive Code Generator → Noir Circuit Hierarchy
```

The pipeline processes queries through the following stages:

1. **Parser**: Converts SPARQL text into SPARQL algebra using the `spargebra` crate
2. **Path Decomposer**: Breaks down property paths into recursive sub-circuits for unbounded path support
3. **Analyzer**: Performs semantic analysis, variable scoping, and dependency analysis
4. **IR Builder**: Constructs the intermediate representation with patterns, expressions, and constraints
5. **Term Encoder**: Converts RDF terms to deterministic field element representations using Noir-compatible hash functions
6. **Circuit Planner**: Determines circuit decomposition strategy and recursive proof requirements
7. **Recursive Code Generator**: Emits hierarchical Noir circuits with recursive verification capabilities

### Recursive Circuit Architecture

The system generates multiple interconnected Noir circuits:

1. **Base Circuits**: Handle atomic operations (single triple matching, basic filters)
2. **Path Circuits**: Implement property path traversal with recursive verification
3. **Dataset Circuits**: Manage multi-dataset queries with signature verification
4. **Aggregation Circuits**: Combine results from multiple sub-circuits
5. **Main Circuit**: Top-level circuit that orchestrates recursive verification

### Module Structure

```
src/
├── lib.rs                 # Public API and re-exports
├── config.rs             # Configuration types and defaults
├── error.rs              # Error types and handling
├── parser/               # SPARQL parsing and normalization
│   ├── mod.rs
│   ├── sparql.rs         # SPARQL text to algebra conversion
│   ├── normalize.rs      # Operator rewriting and simplification
│   └── paths.rs          # Property path expansion
├── analysis/             # Semantic analysis
│   ├── mod.rs
│   ├── variables.rs      # Variable scoping and dependency analysis
│   ├── types.rs          # Type inference and coercion planning
│   └── optimization.rs   # Query optimization hints
├── ir/                   # Intermediate representation
│   ├── mod.rs
│   ├── types.rs          # Core IR data structures
│   ├── builder.rs        # IR construction from algebra
│   ├── serialize.rs      # Deterministic serialization
│   └── validate.rs       # IR validation and consistency checks
├── encoding/             # Term encoding and hashing
│   ├── mod.rs
│   ├── terms.rs          # RDF term to field element conversion
│   ├── literals.rs       # Literal decomposition and canonicalization
│   └── cache.rs          # Encoding cache for performance
├── membership/           # Merkle tree and membership planning
│   ├── mod.rs
│   ├── merkle.rs         # Merkle tree construction and verification
│   ├── planner.rs        # Membership requirement analysis
│   └── witness.rs        # Witness specification generation
├── codegen/              # Code generation
│   ├── mod.rs
│   ├── noir.rs           # Noir-specific code generation
│   ├── templates.rs      # Code templates and snippets
│   └── optimize.rs       # Circuit optimization
├── crypto/               # Cryptographic utilities
│   ├── mod.rs
│   ├── hash.rs           # Hash function abstractions
│   └── signatures.rs     # Signature verification utilities
└── cli/                  # Command-line interface
    ├── mod.rs
    ├── compile.rs        # Compile command implementation
    ├── prove.rs          # Prove command implementation
    └── verify.rs         # Verify command implementation
```

## SPARQL Path Handling with Recursive Circuits

### Property Path Decomposition

SPARQL property paths are handled through recursive circuit decomposition:

```rust
// Path operators mapped to recursive patterns
enum PathOperation {
    Sequence(Box<PathOperation>, Box<PathOperation>),     // path1 / path2
    Alternative(Vec<PathOperation>),                      // path1 | path2 | ...
    ZeroOrMore(Box<PathOperation>),                      // path*
    OneOrMore(Box<PathOperation>),                       // path+
    ZeroOrOne(Box<PathOperation>),                       // path?
    Inverse(Box<PathOperation>),                         // ^path
    Atomic(IRI),                                         // <predicate>
}
```

### Recursive Path Circuit Generation

For unbounded paths (`*` and `+` operators), the system generates recursive circuits:

```noir
// Base path circuit - verifies a single step
struct PathStep {
    source: Field,
    target: Field,
    predicate: Field,
    dataset_proof: MerkleProof,
}

fn verify_path_step(
    step: PathStep,
    dataset_root: Field,
    pub_key: [Field; 2],
    signature: [Field; 2]
) -> bool {
    // Verify triple membership in dataset
    let triple_hash = poseidon_hash([step.source, step.predicate, step.target]);
    let membership_valid = verify_merkle_proof(triple_hash, step.dataset_proof, dataset_root);
    
    // Verify dataset signature
    let sig_valid = ecdsa_secp256k1::verify_signature(pub_key[0], pub_key[1], signature, dataset_root);
    
    membership_valid & sig_valid
}

// Recursive path circuit - verifies path of arbitrary length
fn verify_path_recursive(
    verification_key: [Field; 114],
    proof: [Field; 93],
    public_inputs: [Field; 3], // [start_node, end_node, path_length]
    key_hash: Field,
    current_step: PathStep
) {
    // Verify the previous path segment recursively
    std::verify_proof(verification_key, proof, public_inputs, key_hash);
    
    // Verify current step extends the path correctly
    let prev_end = public_inputs[1];
    assert(current_step.source == prev_end);
    
    // Verify current step is valid
    assert(verify_path_step(current_step, dataset_root, pub_key, signature));
}
```

### Multi-Dataset Handling

For queries spanning multiple datasets, the system uses recursive aggregation:

```noir
struct DatasetProof {
    root: Field,
    signature: [Field; 2],
    pub_key: [Field; 2],
    triple_proofs: [MerkleProof; MAX_TRIPLES_PER_DATASET],
}

fn verify_multi_dataset_query(
    dataset_proofs: [DatasetProof; MAX_DATASETS],
    query_constraints: QueryConstraints,
    // Recursive verification of previous datasets
    verification_key: [Field; 114],
    proof: [Field; 93],
    public_inputs: [Field],
    key_hash: Field
) {
    // Verify previous datasets recursively (if any)
    if proof.len() > 0 {
        std::verify_proof(verification_key, proof, public_inputs, key_hash);
    }
    
    // Verify current dataset
    for i in 0..dataset_proofs.len() {
        let dataset = dataset_proofs[i];
        
        // Verify dataset signature
        let sig_valid = ecdsa_secp256k1::verify_signature(
            dataset.pub_key[0], 
            dataset.pub_key[1], 
            dataset.signature, 
            dataset.root
        );
        assert(sig_valid);
        
        // Verify required triples exist in this dataset
        verify_dataset_triples(dataset, query_constraints);
    }
}
```

## Term Encoding for Noir Circuits

### Field Element Encoding Strategy

RDF terms are encoded as Noir Field elements using a hierarchical approach:

```rust
// Term encoding uses Noir's native hash functions
#[derive(Clone, Debug)]
pub struct TermEncoding {
    pub field_value: Field,
    pub term_type: TermType,
    pub components: Option<TermComponents>,
}

#[derive(Clone, Debug)]
pub enum TermType {
    NamedNode = 0,
    BlankNode = 1, 
    Literal = 2,
    DefaultGraph = 3,
}

// Encoding function compatible with Noir
fn encode_term(term: &str, term_type: TermType, namespace_id: Option<u32>) -> Field {
    match term_type {
        TermType::NamedNode => {
            // Use Blake2s (available in Noir) for IRI encoding
            let hash_bytes = blake2s(term.as_bytes());
            bytes_to_field(hash_bytes)
        },
        TermType::BlankNode => {
            // Namespace isolation for multi-dataset scenarios
            let namespace = namespace_id.unwrap_or(0);
            let combined = format!("{}:{}", namespace, term);
            let hash_bytes = blake2s(combined.as_bytes());
            bytes_to_field(hash_bytes)
        },
        TermType::Literal => {
            // Decompose literal for type-aware operations
            encode_literal(term)
        },
        TermType::DefaultGraph => Field::zero(),
    }
}
```

### Literal Decomposition for SPARQL Operations

Literals are decomposed to support SPARQL's type system:

```rust
#[derive(Clone, Debug)]
pub struct LiteralComponents {
    pub lexical_hash: Field,      // Hash of lexical form
    pub datatype_hash: Field,     // Hash of datatype IRI
    pub language_hash: Field,     // Hash of language tag (0 if none)
    pub numeric_value: Option<NumericEncoding>,
    pub boolean_value: Option<bool>,
    pub string_length: Option<u32>,
}

#[derive(Clone, Debug)]
pub enum NumericEncoding {
    Integer(i64),                 // Direct field representation for small integers
    Decimal { mantissa: i64, scale: u8 }, // Fixed-point decimal
    // Float/Double deferred to Phase 2
}

fn encode_literal(literal: &str) -> (Field, LiteralComponents) {
    let (lexical, datatype, language) = parse_literal(literal);
    
    let lexical_hash = blake2s_to_field(lexical.as_bytes());
    let datatype_hash = blake2s_to_field(datatype.as_bytes());
    let language_hash = if let Some(lang) = language {
        blake2s_to_field(lang.to_lowercase().as_bytes())
    } else {
        Field::zero()
    };
    
    // Extract typed values for operations
    let (numeric_value, boolean_value, string_length) = extract_typed_values(&lexical, &datatype);
    
    // Combine into final encoding
    let encoding = poseidon_hash([
        TermType::Literal as Field,
        lexical_hash,
        datatype_hash, 
        language_hash
    ]);
    
    let components = LiteralComponents {
        lexical_hash,
        datatype_hash,
        language_hash,
        numeric_value,
        boolean_value,
        string_length,
    };
    
    (encoding, components)
}
```

## Circuit Logic for SPARQL Operations

### Basic Graph Pattern Verification

```noir
struct Triple {
    subject: Field,
    predicate: Field,
    object: Field,
}

struct MerkleProof {
    siblings: [Field; MERKLE_DEPTH],
    directions: [bool; MERKLE_DEPTH],
}

fn verify_bgp(
    patterns: [TriplePattern; MAX_PATTERNS],
    bindings: [Field; MAX_VARIABLES],
    candidate_triples: [[Triple; MAX_CANDIDATES]; MAX_PATTERNS],
    merkle_proofs: [[MerkleProof; MAX_CANDIDATES]; MAX_PATTERNS],
    dataset_root: Field
) {
    for pattern_idx in 0..patterns.len() {
        let pattern = patterns[pattern_idx];
        let mut pattern_matched = false;
        
        // Try each candidate triple for this pattern
        for candidate_idx in 0..candidate_triples[pattern_idx].len() {
            let triple = candidate_triples[pattern_idx][candidate_idx];
            let proof = merkle_proofs[pattern_idx][candidate_idx];
            
            // Check if triple matches pattern with current bindings
            let subject_match = match_term(pattern.subject, triple.subject, bindings);
            let predicate_match = match_term(pattern.predicate, triple.predicate, bindings);
            let object_match = match_term(pattern.object, triple.object, bindings);
            
            let triple_matches = subject_match & predicate_match & object_match;
            
            if triple_matches {
                // Verify triple exists in dataset
                let triple_hash = poseidon_hash([triple.subject, triple.predicate, triple.object]);
                let membership_valid = verify_merkle_inclusion(triple_hash, proof, dataset_root);
                assert(membership_valid);
                
                pattern_matched = true;
                break;
            }
        }
        
        assert(pattern_matched); // All patterns must match
    }
}

fn match_term(pattern_term: TermPattern, triple_term: Field, bindings: [Field; MAX_VARIABLES]) -> bool {
    match pattern_term.kind {
        TermPatternKind::Variable => {
            let var_idx = pattern_term.variable_index;
            bindings[var_idx] == triple_term
        },
        TermPatternKind::Constant => {
            pattern_term.constant_value == triple_term
        }
    }
}
```

### FILTER Expression Evaluation

```noir
enum FilterOp {
    Equal,
    NotEqual,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
    And,
    Or,
    Not,
}

struct FilterExpr {
    op: FilterOp,
    left: ValueRef,
    right: ValueRef,
    result_type: ValueType,
}

fn evaluate_filter(
    expr: FilterExpr,
    bindings: [Field; MAX_VARIABLES],
    literal_components: [LiteralComponents; MAX_LITERALS]
) -> bool {
    let left_val = resolve_value_ref(expr.left, bindings, literal_components);
    let right_val = resolve_value_ref(expr.right, bindings, literal_components);
    
    match expr.op {
        FilterOp::Equal => left_val.field_value == right_val.field_value,
        FilterOp::NotEqual => left_val.field_value != right_val.field_value,
        FilterOp::LessThan => {
            // Numeric comparison requires type coercion
            assert(left_val.value_type == ValueType::Numeric);
            assert(right_val.value_type == ValueType::Numeric);
            compare_numeric_less_than(left_val.numeric_value, right_val.numeric_value)
        },
        FilterOp::And => {
            let left_bool = effective_boolean_value(left_val);
            let right_bool = effective_boolean_value(right_val);
            left_bool & right_bool
        },
        // ... other operators
    }
}

fn effective_boolean_value(val: ResolvedValue) -> bool {
    match val.value_type {
        ValueType::Boolean => val.boolean_value,
        ValueType::Numeric => val.numeric_value != 0,
        ValueType::String => val.string_length > 0,
        ValueType::IRI => true, // IRIs are always true in EBV
        ValueType::BlankNode => true, // Blank nodes are always true in EBV
    }
}
```

### OPTIONAL Pattern Handling

```noir
fn verify_optional_pattern(
    optional_patterns: [TriplePattern; MAX_OPTIONAL_PATTERNS],
    bindings: [Field; MAX_VARIABLES],
    optional_matched: [bool; MAX_OPTIONAL_PATTERNS], // Witness indicating which optionals matched
    // ... triple candidates and proofs
) {
    for i in 0..optional_patterns.len() {
        if optional_matched[i] {
            // If marked as matched, verify the pattern actually matches
            verify_pattern_match(optional_patterns[i], bindings, /* ... */);
        }
        // If not matched, no constraint - this is the optional semantics
    }
}
```

### UNION Pattern Handling

```noir
fn verify_union_pattern(
    union_branches: [[TriplePattern; MAX_PATTERNS]; MAX_UNION_BRANCHES],
    branch_selector: [bool; MAX_UNION_BRANCHES], // Exactly one must be true
    bindings: [Field; MAX_VARIABLES],
    // ... candidates and proofs per branch
) {
    // Ensure exactly one branch is selected
    let mut selected_count = 0;
    for i in 0..branch_selector.len() {
        if branch_selector[i] {
            selected_count += 1;
        }
    }
    assert(selected_count == 1);
    
    // Verify the selected branch
    for branch_idx in 0..union_branches.len() {
        if branch_selector[branch_idx] {
            verify_bgp_branch(union_branches[branch_idx], bindings, /* ... */);
        }
    }
}
```

## Components and Interfaces

### Core Data Structures

#### Configuration
```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompilerConfig {
    pub hash_function: HashFunction,
    pub merkle_depth: usize,
    pub max_path_depth: usize,
    pub candidate_array_sizes: Vec<usize>,
    pub optimization_level: OptimizationLevel,
    pub enable_caching: bool,
    pub field_size_bits: u32, // e.g., 254 for BN254
}

#[derive(Debug, Clone, Copy)]
pub enum HashFunction {
    Blake2s,
    Poseidon2,
    Pedersen,
}
```

#### Intermediate Representation
```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProgramIR {
    pub meta: ProgramMeta,
    pub patterns: Vec<PatternIR>,
    pub expressions: BTreeMap<ExprId, ExpressionMeta>,
    pub constraints: Vec<ConstraintIR>,
    pub membership: MembershipPlan,
    pub witness: WitnessSpec,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PatternIR {
    pub id: PatternId,
    pub subject: TermPlaceholder,
    pub predicate: TermPlaceholder,
    pub object: TermPlaceholder,
    pub graph: TermPlaceholder,
    pub optional_group: Option<String>,
    pub union_branch: Option<String>,
    pub dataset_affinity: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TermPlaceholder {
    Variable(String),
    Constant {
        value: String,
        term_type: TermType,
        encoding: FieldElement,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ConstraintIR {
    Membership { pattern_id: PatternId, dataset_index: usize },
    Equality { left: ValueRef, right: ValueRef },
    ExpressionEBV { expr_id: ExprId },
    And(Vec<ConstraintIR>),
    Or(Vec<ConstraintIR>),
    Implies { premise: Box<ConstraintIR>, consequence: Box<ConstraintIR> },
    Branch { selectors: Vec<String>, branches: Vec<Vec<ConstraintIR>> },
}
```

#### Term Encoding
```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TermEncoding {
    pub original: String,
    pub term_type: TermType,
    pub field_element: FieldElement,
    pub components: Option<LiteralComponents>,
    pub type_tag: u8, // 0=IRI, 1=BlankNode, 2=Literal, 3=DefaultGraph
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LiteralComponents {
    pub lexical_hash: FieldElement,
    pub datatype_hash: FieldElement,
    pub language_hash: Option<FieldElement>,
    pub numeric_value: Option<NumericValue>,
    pub boolean_value: Option<bool>,
    pub string_length: Option<u32>, // for EBV and string operations
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NumericValue {
    Integer(i64),
    Decimal { mantissa: i64, scale: u32 },
    // Float/Double support deferred to Phase 2
}

// Noir-specific encoding utilities
impl TermEncoding {
    pub fn to_noir_field(&self) -> String {
        format!("0x{:064x}", self.field_element)
    }
    
    pub fn to_noir_type_check(&self, expected_type: TermType) -> String {
        format!("assert({} == {})", self.type_tag, expected_type as u8)
    }
}
```

### Parser Module

The parser module handles SPARQL text processing and normalization:

```rust
pub trait SparqlParser {
    fn parse(&self, query: &str) -> Result<spargebra::Query, ParseError>;
}

pub trait Normalizer {
    fn normalize(&self, algebra: spargebra::algebra::Algebra) -> Result<spargebra::algebra::Algebra, NormalizeError>;
}

pub trait PathExpander {
    fn expand_paths(&self, algebra: spargebra::algebra::Algebra, max_depth: usize) -> Result<spargebra::algebra::Algebra, PathError>;
}
```

The parser uses `spargebra` for initial parsing, then applies normalization rules:
- Rewrite equivalent operators (e.g., `NOT IN` expansion)
- Expand property paths with configurable depth limits
- Flatten nested AND/OR operations
- Push filters down to appropriate levels

### Analysis Module

Semantic analysis provides information needed for correct code generation:

```rust
pub struct VariableAnalysis {
    pub variables: BTreeSet<String>,
    pub scopes: BTreeMap<String, VariableScope>,
    pub dependencies: DependencyGraph,
}

pub struct TypeAnalysis {
    pub expr_types: BTreeMap<ExprId, ValueCategory>,
    pub coercions: Vec<CoercionStep>,
    pub type_assertions: Vec<TypeAssertion>,
}

pub trait Analyzer {
    fn analyze_variables(&self, algebra: &spargebra::algebra::Algebra) -> VariableAnalysis;
    fn analyze_types(&self, algebra: &spargebra::algebra::Algebra) -> TypeAnalysis;
}
```

### IR Builder

The IR builder converts normalized SPARQL algebra into the internal representation:

```rust
pub trait IRBuilder {
    fn build_ir(&self, 
                algebra: spargebra::algebra::Algebra, 
                analysis: AnalysisResult) -> Result<ProgramIR, IRError>;
}

impl IRBuilder for DefaultIRBuilder {
    fn build_ir(&self, algebra: spargebra::algebra::Algebra, analysis: AnalysisResult) -> Result<ProgramIR, IRError> {
        let mut builder = IRBuilderState::new();
        
        // Convert patterns
        let patterns = self.convert_patterns(&algebra, &mut builder)?;
        
        // Convert expressions
        let expressions = self.convert_expressions(&algebra, &analysis.types, &mut builder)?;
        
        // Generate constraints
        let constraints = self.generate_constraints(&patterns, &expressions, &analysis)?;
        
        // Plan membership requirements
        let membership = self.plan_membership(&patterns)?;
        
        // Generate witness specification
        let witness = self.generate_witness_spec(&patterns, &expressions, &membership)?;
        
        Ok(ProgramIR {
            meta: self.generate_meta(&algebra)?,
            patterns,
            expressions,
            constraints,
            membership,
            witness,
        })
    }
}
```

### Term Encoding Module

Term encoding provides deterministic conversion of RDF terms to field elements:

```rust
pub trait TermEncoder {
    fn encode_term(&self, term: &str, term_type: TermType) -> Result<TermEncoding, EncodingError>;
    fn encode_literal(&self, literal: &str, datatype: Option<&str>, language: Option<&str>) -> Result<TermEncoding, EncodingError>;
}

pub struct Blake2sEncoder {
    cache: LruCache<String, TermEncoding>,
}

impl TermEncoder for Blake2sEncoder {
    fn encode_term(&self, term: &str, term_type: TermType) -> Result<TermEncoding, EncodingError> {
        if let Some(cached) = self.cache.get(term) {
            return Ok(cached.clone());
        }
        
        let field_element = match term_type {
            TermType::NamedNode => self.hash_iri(term),
            TermType::BlankNode => self.hash_blank_node(term),
            TermType::Literal => return self.encode_literal(term, None, None),
            TermType::DefaultGraph => FieldElement::zero(),
        };
        
        let encoding = TermEncoding {
            original: term.to_string(),
            term_type,
            field_element,
            components: None,
        };
        
        self.cache.put(term.to_string(), encoding.clone());
        Ok(encoding)
    }
}
```

### Membership Planning

The membership planner determines which triples need Merkle proofs:

```rust
pub struct MembershipPlan {
    pub entries: Vec<MembershipEntry>,
    pub merkle_depths: Vec<usize>,
    pub dataset_roots: Vec<FieldElement>,
}

pub struct MembershipEntry {
    pub pattern_id: PatternId,
    pub dataset_index: usize,
    pub triple_hash: FieldElement,
    pub required: bool, // false for optional patterns
}

pub trait MembershipPlanner {
    fn plan_membership(&self, patterns: &[PatternIR], datasets: &[Dataset]) -> Result<MembershipPlan, MembershipError>;
}
```

### Code Generation

The code generator produces Noir circuits from the IR:

```rust
pub trait CodeGenerator {
    fn generate(&self, ir: &ProgramIR, config: &CompilerConfig) -> Result<String, CodeGenError>;
}

pub struct NoirCodeGenerator {
    templates: TemplateEngine,
    optimizer: CircuitOptimizer,
}

impl CodeGenerator for NoirCodeGenerator {
    fn generate(&self, ir: &ProgramIR, config: &CompilerConfig) -> Result<String, CodeGenError> {
        let mut context = CodeGenContext::new(ir, config);
        
        // Generate type definitions
        let types = self.generate_types(&context)?;
        
        // Generate constants
        let constants = self.generate_constants(&context)?;
        
        // Generate helper functions
        let helpers = self.generate_helpers(&context)?;
        
        // Generate main function
        let main_fn = self.generate_main_function(&context)?;
        
        // Combine and optimize
        let code = self.combine_sections(types, constants, helpers, main_fn)?;
        let optimized = self.optimizer.optimize(code, &context)?;
        
        Ok(optimized)
    }
}
```

## Open-World Profile: Merkle Inclusion Only

Scope: We target the SPARQL fragment compatible with the open world assumption (OWA) using only Merkle inclusion proofs over triple (or quadruple) hashes. We do not attempt to prove non-existence or global completeness properties.

Implications:
- Supported: BGPs, FILTERs that operate on provided bindings (numeric/string ops, term equality), OPTIONAL (left-join) without asserting unmatched cases, UNION, property paths (sequence, alternative, inverse, repetition via bounded or recursive witness), VALUES/BINDINGS, GRAPH/named graphs.
- Unsupported in OWA profile: MINUS, FILTER NOT EXISTS, EXISTS used negatively, exact aggregates (COUNT/SUM/AVG/MIN/MAX), GROUP BY/HAVING, DISTINCT, ORDER BY, LIMIT/OFFSET as provable claims, and any filter requiring proof of unbound variables (e.g., !BOUND(?x)).
- Negated property sets in paths are allowed because they compile to local predicate-inequality checks on witnessed triples.

Design notes:
- Dataset ingestion builds Merkle trees of triple or quadruple hashes (including graph tag). Roots are signed per dataset.
- MembershipPlan contains inclusion proofs only. Circuits never try to prove that “no other matching triple exists.”
- OPTIONAL semantics are realized by conditional checks: when an optional branch is claimed matched, we verify it; otherwise we impose no constraints.

## Global Claims (Future Work – Out of Scope for OWA Profile)

Aggregates (COUNT/SUM/AVG/MIN/MAX), GROUP BY/HAVING, DISTINCT, ORDER BY, and LIMIT/OFFSET require completeness statements about the result set, which conflict with the OWA scope. If needed in the future, a result-set commitment layer (e.g., a commitment to the full multiset of solutions) can be added alongside recursive fold gadgets. For this profile, such features are rejected at compile time with clear diagnostics.

## Named Graphs and Dataset Semantics

SPARQL graph matching operates over a default graph and zero-or-more named graphs. The IR and ADS must reflect quadruples where appropriate:

- Extend PatternIR.graph to allow Variable/Constant/Default. For default graph BGPs, graph can be omitted or set to Default.
- Leaf hashing and ADS keys must include a graph selector tag to avoid cross-graph collisions.
- GRAPH ?g { ... }: insert a join on the graph variable across enclosed patterns. If GRAPH <iri> is used, compile to constants in PatternIR.graph.
- FROM/FROM NAMED: capture dataset description in meta; the circuit should bind allowable graph IRIs in a public input list and assert that matched patterns use only those graphs.

Witness generation uses the dataset catalog to select the correct roots per graph collection when datasets are split per named graph.

## String and Regex Strategy

SPARQL string functions (REGEX, CONTAINS, STRSTARTS, STRENDS, SUBSTR, REPLACE, UCASE/LCASE, STRLEN, CONCAT) are challenging in circuits. We adopt a bounded, verifiable preimage approach:

- Represent strings as fixed-maximum-length byte arrays with an explicit length field. The witness includes the byte array, and the circuit checks blake2s(bytes[0..len]) equals the lexical_hash component used in term encoding.
- Implement in-circuit gadgets for:
    - Equality/inequality and length
    - CONTAINS/STARTS/ENDS via simple sliding-window checks
    - Case transforms with ASCII-only mapping (extended Unicode as Phase 3)
    - REGEX using an NFA simulator over bytes with bounded pattern size and input length. For feature completeness, we specify bounds (e.g., MAX_STR_LEN, MAX_REGEX_STATES) in CompilerConfig to keep circuits finite.

For language tags and langMatches, store normalized lowercase language tags as byte arrays and implement the BCP47 prefix match semantics under a bounded length.

## Negative Patterns: MINUS and NOT EXISTS

With the ADS supporting non-membership proofs, we implement:

- MINUS: For a left solution µ, the circuit asserts there does not exist a mapping ν in the right pattern that is compatible with µ. Practically, we prove that for all candidate bindings constructed from µ and the right BGP (bounded by candidate array sizes), none are members; or we provide a succinct non-membership proof for each possible triple required. We add a dedicated constraint kind: ConstraintIR::NonExistence with a witness that shows a non-membership proof against the ADS for each saturating triple key.
- FILTER NOT EXISTS: Similar to MINUS but scoped within FILTER; the constraint becomes a guard over the enclosing EBV.

We require query normalization to push NOT EXISTS to patterns that can be reasoned about via triple-level non-membership. Complex correlated subqueries rely on subquery support below.

## Subqueries and Solution Modifiers

Subqueries introduce nested scopes, aggregates, and modifiers. We extend the IR:

- Add SubqueryIR node that contains its own ProgramIR, projected variables, and a ResultPlan/commitment. Parent queries can reference the subquery via EXISTS/NOT EXISTS, IN/NOT IN, or by joining projected variables.
- Solution modifiers:
    - DISTINCT/REDUCED: enable distinct_root commitment and verify inclusion against it.
    - ORDER BY/LIMIT/OFFSET: expose order key encoding and enable top-k proofs against the result commitment when required by the claim; otherwise, treat them as non-provable presentation features.

We explicitly separate “provable claim modes”: per-binding inclusion vs global properties (order, counts). The CLI surfaces these modes.

## Property Path Extensions

Include full SPARQL 1.1 path operators:

- Negated property set: compile to a constraint that the predicate is not in a given finite set; implement via inequality constraints against the encoded predicate set. For property path expressions containing negation, bound the candidate predicate set to the finite enumerated set from the query (as per spec).
- Bounded repetition with selectors remains as in the current design. For unbounded repetition, retain recursive proof strategy.

## RDF Term Equality Semantics

SPARQL distinguishes term equality (=) from sameTerm() and value equality under type promotion. We define:

- sameTerm(?a, ?b): strict equality of the full term encoding (type tag + value hash).
- = operator: apply SPARQL’s type promotion and numeric normalization before comparison; for literals, compare semantic_value fields post-coercion; for IRIs and blank nodes, behaves like sameTerm.
- != and ordering: respect SPARQL ordering partial order; for circuit feasibility, we restrict ordering comparisons to numeric and string-like with explicit rules; other orderings are unsupported and must raise compile-time errors.

These rules are implemented in the Analyzer (type/coercion planning) and enforced in Noir helpers.

## SPARQL Path Handling

### Path Expansion Strategy

SPARQL property paths are expanded into multiple triple patterns during the normalization phase. Each path operator is handled as follows:

#### Basic Path Operators
- **Sequence (/)**: `?s ex:p1/ex:p2 ?o` → `?s ex:p1 ?_tmp . ?_tmp ex:p2 ?o`
- **Alternative (|)**: `?s ex:p1|ex:p2 ?o` → `UNION { ?s ex:p1 ?o } { ?s ex:p2 ?o }`
- **Inverse (^)**: `?s ^ex:p ?o` → `?o ex:p ?s`

#### Repetition Operators (with bounded expansion)
- **Optional (?)**: `?s ex:p? ?o` → `UNION { ?s ?o } { ?s ex:p ?o }` (identity + single step)
- **Zero or more (*)**: Expands to union of 0, 1, 2, ..., max_depth steps
- **One or more (+)**: Expands to union of 1, 2, ..., max_depth steps

```rust
pub struct PathExpansion {
    pub original_pattern: PatternIR,
    pub expanded_patterns: Vec<PatternIR>,
    pub union_structure: Option<UnionStructure>,
    pub max_depth_reached: bool,
}

pub struct UnionStructure {
    pub selector_bits: Vec<String>, // e.g., ["path_sel_0", "path_sel_1"]
    pub branch_patterns: Vec<Vec<PatternIR>>,
}
```

### Path Expansion in Noir Circuits

For paths that expand to unions, the circuit generates selector bits and conditional logic:

```noir
// Example: ?s ex:knows+ ?o (one or more steps)
// Expands to: UNION { ?s ex:knows ?o } { ?s ex:knows ?_tmp1 . ?_tmp1 ex:knows ?o } { ... }

fn verify_path_plus(
    subject: Field,
    object: Field,
    path_selectors: [bool; MAX_PATH_DEPTH],
    intermediate_nodes: [Field; MAX_PATH_DEPTH - 1],
    candidates: [[Triple; CANDIDATE_SIZE]; MAX_PATH_DEPTH]
) -> bool {
    let mut path_satisfied = false;
    
    // Ensure exactly one path length is selected
    let mut selector_sum = 0;
    for i in 0..MAX_PATH_DEPTH {
        selector_sum += path_selectors[i] as Field;
    }
    assert(selector_sum == 1);
    
    // Check each possible path length
    for depth in 1..=MAX_PATH_DEPTH {
        if path_selectors[depth - 1] {
            path_satisfied = verify_path_of_length(
                subject, object, depth, intermediate_nodes, candidates[depth - 1]
            );
        }
    }
    
    path_satisfied
}
```

## Circuit Logic Patterns

### Basic Triple Pattern Verification

Each triple pattern generates a membership verification loop in Noir:

```noir
struct Triple {
    subject: Field,
    predicate: Field,
    object: Field,
}

fn verify_triple_pattern(
    pattern_subject: Field,    // encoded term or variable binding
    pattern_predicate: Field,  // encoded term or variable binding  
    pattern_object: Field,     // encoded term or variable binding
    candidates: [Triple; CANDIDATE_SIZE],
    merkle_paths: [MerklePath; CANDIDATE_SIZE]
) -> bool {
    let mut pattern_matched = false;
    
    for i in 0..CANDIDATE_SIZE {
        let candidate = candidates[i];
        let path = merkle_paths[i];
        
        // Check if candidate matches pattern
        let subject_match = (pattern_subject == candidate.subject);
        let predicate_match = (pattern_predicate == candidate.predicate);
        let object_match = (pattern_object == candidate.object);
        let triple_match = subject_match & predicate_match & object_match;
        
        // Verify Merkle membership if triple matches
        let membership_valid = verify_merkle_path(candidate, path);
        let valid_candidate = triple_match & membership_valid;
        
        pattern_matched = pattern_matched | valid_candidate;
    }
    
    pattern_matched
}
```

### FILTER Expression Evaluation

Different types of FILTER conditions are handled with specific circuit patterns:

#### Equality and Comparison Filters
```noir
// FILTER(?age > 18)
fn evaluate_numeric_comparison(
    left_value: Field,
    right_value: Field,
    left_is_numeric: bool,
    right_is_numeric: bool,
    operator: u8  // 0=eq, 1=ne, 2=lt, 3=le, 4=gt, 5=ge
) -> bool {
    // Ensure both operands are numeric
    assert(left_is_numeric & right_is_numeric);
    
    // Extract numeric values (assuming integer for simplicity)
    let left_num = extract_integer_value(left_value);
    let right_num = extract_integer_value(right_value);
    
    // Perform comparison based on operator
    let result = match operator {
        0 => left_num == right_num,
        1 => left_num != right_num,
        2 => left_num < right_num,
        3 => left_num <= right_num,
        4 => left_num > right_num,
        5 => left_num >= right_num,
        _ => false
    };
    
    result
}
```

#### String Operations
```noir
// FILTER(CONTAINS(?name, "John"))
fn evaluate_string_contains(
    haystack: Field,
    needle: Field,
    haystack_components: LiteralComponents,
    needle_components: LiteralComponents
) -> bool {
    // Verify both are string-like literals
    assert(haystack_components.is_string_like);
    assert(needle_components.is_string_like);
    
    // Use string matching gadget (implementation depends on string representation)
    string_contains_gadget(
        haystack_components.lexical_hash,
        needle_components.lexical_hash,
        haystack_components.string_length,
        needle_components.string_length
    )
}
```

#### Type Testing Functions
```noir
// FILTER(isIRI(?x))
fn evaluate_is_iri(term_value: Field, term_type_tag: Field) -> bool {
    term_type_tag == 0  // IRI type tag
}

// FILTER(isLiteral(?x))
fn evaluate_is_literal(term_value: Field, term_type_tag: Field) -> bool {
    term_type_tag == 2  // Literal type tag
}

// FILTER(BOUND(?x))
fn evaluate_bound(variable_binding: Field, is_bound_flag: bool) -> bool {
    is_bound_flag
}
```

#### Effective Boolean Value (EBV) Evaluation
```noir
fn evaluate_ebv(
    term_value: Field,
    term_type_tag: Field,
    literal_components: LiteralComponents
) -> bool {
    if term_type_tag == 2 {  // Literal
        if literal_components.boolean_value.is_some() {
            literal_components.boolean_value.unwrap()
        } else if literal_components.numeric_value.is_some() {
            // Numeric: false if zero, true otherwise
            literal_components.numeric_value.unwrap() != 0
        } else {
            // String: false if empty, true otherwise
            literal_components.string_length.unwrap_or(0) > 0
        }
    } else {
        // IRI and BlankNode cause EBV error in SPARQL
        false  // or assert(false) to fail the circuit
    }
}
```

### OPTIONAL Pattern Handling

OPTIONAL patterns use conditional constraints with guard variables:

```noir
fn verify_optional_pattern(
    required_patterns_satisfied: bool,
    optional_pattern_candidates: [Triple; CANDIDATE_SIZE],
    optional_pattern_bindings: [Field; NUM_OPTIONAL_VARS]
) -> ([Field; NUM_OPTIONAL_VARS], [bool; NUM_OPTIONAL_VARS]) {
    let mut optional_satisfied = false;
    let mut optional_bindings = [0; NUM_OPTIONAL_VARS];
    let mut binding_flags = [false; NUM_OPTIONAL_VARS];
    
    // Only try to match optional pattern if required patterns are satisfied
    if required_patterns_satisfied {
        for i in 0..CANDIDATE_SIZE {
            let candidate = optional_pattern_candidates[i];
            let matches = verify_triple_match(candidate, /* pattern terms */);
            
            if matches {
                optional_satisfied = true;
                // Extract variable bindings from matching candidate
                optional_bindings = extract_bindings(candidate);
                binding_flags = [true; NUM_OPTIONAL_VARS];
                break;
            }
        }
    }
    
    (optional_bindings, binding_flags)
}
```

### UNION Pattern Handling

UNION patterns use selector bits to choose between alternatives:

```noir
fn verify_union_pattern(
    union_selectors: [bool; NUM_UNION_BRANCHES],
    branch_candidates: [[Triple; CANDIDATE_SIZE]; NUM_UNION_BRANCHES]
) -> bool {
    // Ensure exactly one branch is selected
    let mut selector_sum = 0;
    for i in 0..NUM_UNION_BRANCHES {
        selector_sum += union_selectors[i] as Field;
    }
    assert(selector_sum == 1);
    
    let mut union_satisfied = false;
    
    for branch in 0..NUM_UNION_BRANCHES {
        if union_selectors[branch] {
            let branch_satisfied = verify_branch_patterns(branch_candidates[branch]);
            union_satisfied = union_satisfied | branch_satisfied;
        }
    }
    
    union_satisfied
}
```

## Data Models

### RDF Term Representation

RDF terms are represented using a hierarchical encoding scheme optimized for Noir circuits:

#### Term Type Tags
```rust
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TermType {
    NamedNode = 0,
    BlankNode = 1,
    Literal = 2,
    DefaultGraph = 3,
}
```

#### Encoding Scheme
Each term is encoded as: `hash2([term_type_tag, value_field])`

**NamedNode Encoding:**
```rust
// For IRI: <http://example.org/person/123>
let iri_hash = blake2s(b"http://example.org/person/123");
let term_encoding = hash2([0, iri_hash]);
```

**BlankNode Encoding:**
```rust
// For blank node: _:person123 in dataset with namespace_id = 42
let label_hash = blake2s(b"person123");
let namespaced_hash = hash2([42, label_hash]);
let term_encoding = hash2([1, namespaced_hash]);
```

**Literal Encoding (Complex):**
```rust
// For literal: "25"^^<http://www.w3.org/2001/XMLSchema#integer>
let lexical_hash = blake2s(b"25");
let datatype_hash = blake2s(b"http://www.w3.org/2001/XMLSchema#integer");
let semantic_value = 25; // canonical integer representation
let lang_hash = 0; // no language tag
let literal_value = hash4([lexical_hash, semantic_value, lang_hash, datatype_hash]);
let term_encoding = hash2([2, literal_value]);
```

#### Literal Component Extraction for Circuit Operations

Different SPARQL operations require access to different components of literals:

```rust
pub struct LiteralWitness {
    pub lexical_form: String,
    pub lexical_hash: Field,
    pub datatype_iri: Option<String>,
    pub datatype_hash: Field,
    pub language_tag: Option<String>,
    pub language_hash: Field,
    
    // Semantic values for operations
    pub integer_value: Option<i64>,
    pub decimal_mantissa: Option<i64>,
    pub decimal_scale: Option<u32>,
    pub boolean_value: Option<bool>,
    pub string_length: Option<u32>,
    
    // Type classification flags
    pub is_numeric: bool,
    pub is_string_like: bool,
    pub is_boolean: bool,
    pub is_datetime: bool,
}
```

#### Noir Circuit Integration

In the generated Noir circuit, terms are handled with type-aware operations:

```noir
struct TermComponents {
    encoding: Field,        // The main term encoding
    type_tag: Field,       // 0=IRI, 1=BlankNode, 2=Literal, 3=DefaultGraph
    
    // Literal-specific components (only valid when type_tag == 2)
    lexical_hash: Field,
    datatype_hash: Field,
    language_hash: Field,
    semantic_value: Field,
    
    // Type flags for operations
    is_numeric: bool,
    is_string_like: bool,
    is_boolean: bool,
}

fn extract_term_components(term_encoding: Field, witness: TermWitness) -> TermComponents {
    // Verify the encoding matches the witness components
    let reconstructed = hash2([witness.type_tag, witness.value_field]);
    assert(reconstructed == term_encoding);
    
    // For literals, verify component consistency
    if witness.type_tag == 2 {
        let literal_value = hash4([
            witness.lexical_hash,
            witness.semantic_value,
            witness.language_hash,
            witness.datatype_hash
        ]);
        assert(literal_value == witness.value_field);
    }
    
    TermComponents {
        encoding: term_encoding,
        type_tag: witness.type_tag,
        lexical_hash: witness.lexical_hash,
        datatype_hash: witness.datatype_hash,
        language_hash: witness.language_hash,
        semantic_value: witness.semantic_value,
        is_numeric: witness.is_numeric,
        is_string_like: witness.is_string_like,
        is_boolean: witness.is_boolean,
    }
}
```

### Literal Decomposition

Literals are decomposed into components for type-aware operations:

```rust
pub struct LiteralDecomposition {
    pub lexical_form: String,
    pub datatype: Option<String>,
    pub language: Option<String>,
    pub canonical_value: Option<CanonicalValue>,
}

pub enum CanonicalValue {
    Boolean(bool),
    Integer(i64),
    Decimal { mantissa: i64, scale: u32 },
    String(String),
    DateTime(DateTime),
    // Additional types as needed
}
```

### Expression Metadata

Expressions carry metadata for type checking and code generation:

```rust
pub struct ExpressionMeta {
    pub id: ExprId,
    pub algebra_expr: spargebra::algebra::Expression,
    pub value_category: ValueCategory,
    pub static_value: Option<CanonicalValue>,
    pub required_coercions: Vec<CoercionStep>,
    pub ebv_safe: bool,
}

pub enum ValueCategory {
    IRI,
    BlankNode,
    SimpleLiteral,
    TypedLiteral,
    NumericInteger,
    NumericDecimal,
    Boolean,
    LangString,
    DateTime,
    StringLike,
    Term,
    Error,
    Unknown,
}
```

## Error Handling

The system uses a hierarchical error type system with specific error types for each module:

```rust
#[derive(Debug, Error)]
pub enum CompilerError {
    #[error("Parse error: {0}")]
    Parse(#[from] ParseError),
    
    #[error("Analysis error: {0}")]
    Analysis(#[from] AnalysisError),
    
    #[error("IR construction error: {0}")]
    IR(#[from] IRError),
    
    #[error("Encoding error: {0}")]
    Encoding(#[from] EncodingError),
    
    #[error("Code generation error: {0}")]
    CodeGen(#[from] CodeGenError),
    
    #[error("Configuration error: {0}")]
    Config(String),
}

#[derive(Debug, Error)]
pub enum ParseError {
    #[error("SPARQL syntax error: {0}")]
    Syntax(#[from] spargebra::SparqlParseError),
    
    #[error("Unsupported SPARQL feature: {0}")]
    Unsupported(String),
    
    #[error("Path expansion exceeded maximum depth: {0}")]
    PathDepthExceeded(usize),
}
```

Each error type includes context information and suggestions for resolution where possible.

## Testing Strategy

### Unit Testing
- Each module has comprehensive unit tests covering normal and edge cases
- Property-based testing for encoding functions to ensure determinism
- Mock implementations for external dependencies (spargebra, cryptographic functions)

### Integration Testing
- End-to-end compilation tests with known SPARQL queries
- Circuit execution tests using the Noir compiler and prover
- Cross-validation against reference SPARQL engines for correctness

### Performance Testing
- Benchmarks for compilation time across different query complexities
- Memory usage profiling for large queries and datasets
- Proof generation time measurements

### Regression Testing
- Snapshot testing for generated Noir code to detect unintended changes
- Compatibility testing across different Noir compiler versions
- Backward compatibility testing for IR serialization formats

## Complete Circuit Structure

### Generated Noir Circuit Template

The compiler generates a complete Noir circuit with the following structure:

```noir
// Auto-generated circuit for SPARQL query
use std::hash::{blake2s, pedersen_hash};
use std::merkle::compute_merkle_root;

// Constants for term encodings
const IRI_EXAMPLE_PERSON: Field = 0x1234567890abcdef...;
const DATATYPE_XSD_INTEGER: Field = 0xfedcba0987654321...;

// Type definitions
struct Triple {
    subject: Field,
    predicate: Field,
    object: Field,
}

struct MerklePath {
    siblings: [Field; MERKLE_DEPTH],
    directions: [bool; MERKLE_DEPTH],
}

struct TermWitness {
    encoding: Field,
    type_tag: Field,
    lexical_hash: Field,
    datatype_hash: Field,
    language_hash: Field,
    semantic_value: Field,
    is_numeric: bool,
    is_string_like: bool,
    is_boolean: bool,
}

// Main circuit function
fn main(
    // Public inputs
    pub variable_bindings: [Field; NUM_VARIABLES],
    pub dataset_roots: [Field; NUM_DATASETS],
    pub query_hash: Field,
    
    // Private inputs
    priv pattern_candidates: [[Triple; CANDIDATE_SIZE]; NUM_PATTERNS],
    priv merkle_paths: [[MerklePath; CANDIDATE_SIZE]; NUM_PATTERNS],
    priv term_witnesses: [TermWitness; NUM_TERM_WITNESSES],
    priv optional_selectors: [bool; NUM_OPTIONAL_PATTERNS],
    priv union_selectors: [bool; NUM_UNION_BRANCHES],
    priv path_selectors: [[bool; MAX_PATH_DEPTH]; NUM_PATH_PATTERNS]
) {
    // 1. Verify dataset integrity (signatures would be added here)
    verify_dataset_signatures(dataset_roots, /* signature witnesses */);
    
    // 2. Verify each triple pattern
    let mut all_patterns_satisfied = true;
    for pattern_id in 0..NUM_PATTERNS {
        let pattern_satisfied = verify_pattern(
            pattern_id,
            variable_bindings,
            pattern_candidates[pattern_id],
            merkle_paths[pattern_id],
            term_witnesses
        );
        all_patterns_satisfied = all_patterns_satisfied & pattern_satisfied;
    }
    
    // 3. Verify FILTER expressions
    let mut all_filters_satisfied = true;
    for filter_id in 0..NUM_FILTERS {
        let filter_satisfied = evaluate_filter(
            filter_id,
            variable_bindings,
            term_witnesses
        );
        all_filters_satisfied = all_filters_satisfied & filter_satisfied;
    }
    
    // 4. Handle OPTIONAL patterns
    verify_optional_patterns(
        all_patterns_satisfied,
        optional_selectors,
        variable_bindings,
        /* optional pattern witnesses */
    );
    
    // 5. Handle UNION patterns
    verify_union_patterns(
        union_selectors,
        variable_bindings,
        /* union pattern witnesses */
    );
    
    // 6. Verify property paths
    verify_path_patterns(
        path_selectors,
        variable_bindings,
        /* path pattern witnesses */
    );
    
    // Final assertion: all constraints must be satisfied
    assert(all_patterns_satisfied & all_filters_satisfied);
}
```

### Witness Layout and Generation

The witness generation process creates structured inputs for the circuit:

```rust
pub struct CircuitWitness {
    // Public witnesses (revealed in proof)
    pub variable_bindings: Vec<FieldElement>,
    pub dataset_roots: Vec<FieldElement>,
    pub query_hash: FieldElement,
    
    // Private witnesses (hidden in proof)
    pub pattern_candidates: Vec<Vec<Triple>>,
    pub merkle_paths: Vec<Vec<MerklePath>>,
    pub term_witnesses: Vec<TermWitness>,
    pub optional_selectors: Vec<bool>,
    pub union_selectors: Vec<bool>,
    pub path_selectors: Vec<Vec<bool>>,
    
    // Derived witnesses (computed from other witnesses)
    pub literal_components: Vec<LiteralComponents>,
    pub numeric_values: Vec<NumericValue>,
    pub string_lengths: Vec<u32>,
}

impl CircuitWitness {
    pub fn generate(
        query: &Query,
        datasets: &[Dataset],
        solution_binding: &SolutionBinding
    ) -> Result<Self, WitnessError> {
        let mut witness = CircuitWitness::new();
        
        // 1. Generate variable bindings from solution
        witness.variable_bindings = solution_binding
            .variables()
            .map(|var| encode_term(solution_binding.get(var)))
            .collect();
        
        // 2. Generate dataset roots
        witness.dataset_roots = datasets
            .iter()
            .map(|dataset| compute_merkle_root(dataset))
            .collect();
        
        // 3. Find candidate triples for each pattern
        for pattern in &query.patterns {
            let candidates = find_matching_candidates(pattern, datasets)?;
            witness.pattern_candidates.push(candidates);
            
            let paths = candidates
                .iter()
                .map(|triple| compute_merkle_path(triple, datasets))
                .collect();
            witness.merkle_paths.push(paths);
        }
        
        // 4. Generate term witnesses for all referenced terms
        witness.term_witnesses = collect_term_witnesses(query, solution_binding)?;
        
        // 5. Generate selector witnesses for OPTIONAL/UNION/PATH patterns
        witness.optional_selectors = generate_optional_selectors(query, solution_binding)?;
        witness.union_selectors = generate_union_selectors(query, solution_binding)?;
        witness.path_selectors = generate_path_selectors(query, solution_binding)?;
        
        Ok(witness)
    }
}
```

### Circuit Optimization Strategies

The generated circuits include several optimization techniques:

#### 1. Constant Folding
```noir
// Instead of computing hash at runtime:
// let datatype_hash = blake2s("http://www.w3.org/2001/XMLSchema#integer");

// Pre-compute and embed as constant:
const XSD_INTEGER_HASH: Field = 0x1a2b3c4d5e6f7890...;
```

#### 2. Common Subexpression Elimination
```noir
// Reuse computed values across multiple patterns
let subject_encoding = variable_bindings[0];  // ?person
// Use subject_encoding in multiple pattern verifications
```

#### 3. Conditional Execution for Optional Patterns
```noir
// Only execute expensive operations when needed
if optional_pattern_enabled {
    let result = expensive_string_operation(term1, term2);
    assert(result == expected_value);
}
```

#### 4. Batch Operations
```noir
// Verify multiple Merkle paths in a single loop
for i in 0..BATCH_SIZE {
    let root = compute_merkle_root(
        candidates[i].hash(),
        merkle_paths[i].siblings,
        merkle_paths[i].directions
    );
    assert(root == dataset_roots[pattern_dataset_map[i]]);
}
```

## Security Considerations

### Cryptographic Security
- Use of well-established hash functions (Blake2s, Poseidon2) for term encoding
- Proper implementation of Merkle tree verification with secure path validation
- Integration with audited ECDSA signature verification libraries

### Privacy Preservation
- Ensure no plaintext RDF data leaks into public circuit inputs
- Proper blank node namespacing to prevent cross-dataset correlation
- Deterministic encoding that doesn't reveal term structure

### Circuit Security
- Generate circuits that fail securely when constraints are not satisfied
- Avoid timing attacks through consistent execution paths
- Proper handling of optional patterns to prevent information leakage

## Performance Optimization

### Compilation Performance
- Caching of compiled circuits based on query and configuration hashes
- Incremental compilation for queries with shared subpatterns
- Parallel processing of independent compilation stages

### Circuit Efficiency
- Common subexpression elimination in constraint generation
- Optimal ordering of constraints to minimize circuit size
- Template-based code generation to reduce redundancy

### Memory Management
- Streaming processing for large datasets where possible
- LRU caching for term encodings and intermediate results
- Efficient data structures for IR representation

## Extensibility Points

### Operator Registry
The system includes a declarative operator registry for easy extension:

```rust
pub struct OperatorDefinition {
    pub sparql_operator: SparqlOperator,
    pub arity: OperatorArity,
    pub argument_categories: Vec<Vec<ValueCategory>>,
    pub result_category: ValueCategory,
    pub coercion_rules: Vec<CoercionRule>,
    pub noir_implementation: NoirImplementation,
}

pub enum NoirImplementation {
    Inline(String),
    Template(String),
    Gadget(String),
}
```

### Backend Abstraction
The code generation is abstracted to support multiple backends:

```rust
pub trait Backend {
    fn generate_circuit(&self, ir: &ProgramIR, config: &CompilerConfig) -> Result<String, BackendError>;
    fn supported_features(&self) -> FeatureSet;
    fn optimization_passes(&self) -> Vec<Box<dyn OptimizationPass>>;
}
```

### Plugin System
A plugin system allows for custom extensions:

```rust
pub trait CompilerPlugin {
    fn name(&self) -> &str;
    fn initialize(&mut self, config: &CompilerConfig) -> Result<(), PluginError>;
    fn transform_ir(&self, ir: &mut ProgramIR) -> Result<(), PluginError>;
    fn generate_code(&self, context: &CodeGenContext) -> Result<Option<String>, PluginError>;
}
```

This design provides a solid foundation for implementing the SPARQL to Noir compiler while maintaining flexibility for future extensions and optimizations.