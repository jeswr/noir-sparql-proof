//! Intermediate representation (IR) for the SPARQL‑to‑Noir compiler.
//!
//! This module defines Rust structures and enums that represent SPARQL queries
//! in a form that is easy to translate into a Noir program.  It follows
//! the specification in `ir_specification.md`.

use std::fmt;

/// An RDF term appearing in a triple pattern or filter.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Term {
    /// An IRI constant (fully expanded URI string).
    Iri(String),
    /// A literal constant (lexical form, including datatype and optional language).
    Literal(String),
    /// A blank node label.
    Blank(String),
    /// A query variable (e.g. `?x`).  Stored without the leading question mark.
    Variable(String),
}

impl Term {
    /// Returns true if this term is a variable.
    pub fn is_variable(&self) -> bool {
        matches!(self, Term::Variable(_))
    }

    /// Get the string representation of the term (without any prefix or markup).
    pub fn as_str(&self) -> &str {
        match self {
            Term::Iri(s) | Term::Literal(s) | Term::Blank(s) | Term::Variable(s) => s,
        }
    }
}

/// A triple pattern: subject, predicate, object.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TriplePattern {
    pub subject: Term,
    pub predicate: Term,
    pub object: Term,
}

/// Simple filter expressions supported by the compiler.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FilterExpr {
    /// Equality between two terms (variable or constant).  Both sides must be
    /// comparable values; the generator will emit `assert(lhs == rhs)`.
    Eq(Term, Term),
    /// Inequality between two terms.
    Neq(Term, Term),
    // Future extensions: comparisons, regex, arithmetic functions.
}

/// A filter on a pattern.  Contains a filter expression and the pattern to
/// which it applies.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Filter {
    pub expr: FilterExpr,
    pub pattern: Box<Pattern>,
}

/// The main IR pattern enumeration.  Each variant corresponds to an operator in
/// the SPARQL algebra.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Pattern {
    /// A basic graph pattern containing a vector of triple patterns.  Matches
    /// when all triples can be matched in the dataset.
    Bgp(Vec<TriplePattern>),
    /// Conjunction of two patterns.  Both must match; shared variables are
    /// enforced via equality checks during code generation.
    Join(Box<Pattern>, Box<Pattern>),
    /// Left (outer) join: the right pattern is optional.  If it fails to
    /// match, the left bindings are preserved.
    LeftJoin(Box<Pattern>, Box<Pattern>),
    /// Disjunction (union) of two patterns.  Either branch may match.
    Union(Box<Pattern>, Box<Pattern>),
    /// A filter applied to a pattern.  Filters can be attached to any node.
    Filter(FilterExpr, Box<Pattern>),
    /// A graph pattern selects a named graph or graph variable.
    Graph(String, Box<Pattern>),
}

/// A SPARQL query after projection has been extracted.  The `projected_vars` list
/// contains the names of variables (without `?`) that appear in the `SELECT`
/// clause.  `pattern` holds the algebraic pattern for the WHERE clause.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Query {
    pub projected_vars: Vec<String>,
    pub pattern: Pattern,
}

/// Display implementation for debugging purposes.
impl fmt::Display for Pattern {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Pattern::Bgp(tp) => {
                write!(f, "BGP(")?;
                for (i, t) in tp.iter().enumerate() {
                    if i > 0 {
                        write!(f, ", ")?;
                    }
                    write!(f, "{} {} {}", t.subject.as_str(), t.predicate.as_str(), t.object.as_str())?;
                }
                write!(f, ")")
            }
            Pattern::Join(a, b) => write!(f, "Join({}, {})", a, b),
            Pattern::LeftJoin(a, b) => write!(f, "LeftJoin({}, {})", a, b),
            Pattern::Union(a, b) => write!(f, "Union({}, {})", a, b),
            Pattern::Filter(expr, p) => write!(f, "Filter({:?}, {})", expr, p),
            Pattern::Graph(g, p) => write!(f, "Graph({}, {})", g, p),
        }
    }
}
