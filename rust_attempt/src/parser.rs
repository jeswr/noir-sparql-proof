//! Parser for SPARQL queries that produces the intermediate representation (IR).
//!
//! This module depends on the `spargebra` crate to parse SPARQL strings into
//! the SPARQL 1.1 abstract syntax tree and then recursively transforms the
//! algebra into the IR defined in `ir.rs`.  Only a subset of SPARQL features
//! are currently supported: basic graph patterns, inner joins, left joins
//! (OPTIONAL), unions and simple equality/inequality filters.

use crate::ir::{FilterExpr, Pattern, Query, Term, TriplePattern};
use thiserror::Error;

/// Possible errors that can occur during parsing or conversion.
#[derive(Debug, Error)]
pub enum ParseError {
    /// An error returned by the underlying `spargebra` parser.
    #[error("SPARQL parse error: {0}")]
    SparqlParse(#[from] spargebra::error::SparqlParseError),
    /// The query uses SPARQL features that are not yet supported by the IR.
    #[error("Unsupported SPARQL feature: {0}")]
    Unsupported(String),
}

/// Parse a SPARQL query string and convert it into the IR.
pub fn parse_query_to_ir(query_str: &str) -> Result<Query, ParseError> {
    use spargebra::SparqlParser;

    let parser = SparqlParser::new();
    let query = parser.parse_query(query_str)?;
    // Extract projection variables and algebraic pattern.
    // The spargebra Query struct contains a field `algebra` of type spargebra::algebra::Query,
    // which we can inspect.  As this is a skeleton implementation, the actual
    // conversion code is simplified and may not handle all cases.  Unsupported
    // operators will produce `ParseError::Unsupported`.
    let projected_vars = query
        .dataset
        .variables
        .iter()
        .map(|v| v.to_string())
        .collect();

    let algebra = query.algebra;
    let pattern = convert_algebra_to_ir(&algebra)?;
    Ok(Query { projected_vars, pattern })
}

/// Recursively convert the `spargebra` algebra expression into our IR pattern.
fn convert_algebra_to_ir(algebra: &spargebra::algebra::Algebra) -> Result<Pattern, ParseError> {
    use spargebra::algebra::{Algebra, GraphPattern};
    match algebra {
        Algebra::BGP { patterns } => {
            let triples = patterns
                .iter()
                .map(|tp| match tp {
                    GraphPattern::Triple(triple) => Ok(TriplePattern {
                        subject: convert_term(&triple.subject),
                        predicate: convert_term(&triple.predicate),
                        object: convert_term(&triple.object),
                    }),
                    _ => Err(ParseError::Unsupported(format!(
                        "Non-triple pattern in BGP: {:?}",
                        tp
                    ))),
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(Pattern::Bgp(triples))
        }
        Algebra::Join(left, right) => {
            let l = convert_algebra_to_ir(left)?;
            let r = convert_algebra_to_ir(right)?;
            Ok(Pattern::Join(Box::new(l), Box::new(r)))
        }
        Algebra::LeftJoin(left, right, expr_opt) => {
            // LeftJoin may carry a filter expression that applies to the right pattern.
            let l = convert_algebra_to_ir(left)?;
            let r = convert_algebra_to_ir(right)?;
            if let Some(expr) = expr_opt {
                // Convert the expression into a filter and wrap it on the right pattern.
                let filter = convert_expr(expr)?;
                Ok(Pattern::LeftJoin(
                    Box::new(l),
                    Box::new(Pattern::Filter(filter, Box::new(r))),
                ))
            } else {
                Ok(Pattern::LeftJoin(Box::new(l), Box::new(r)))
            }
        }
        Algebra::Union(left, right) => {
            let l = convert_algebra_to_ir(left)?;
            let r = convert_algebra_to_ir(right)?;
            Ok(Pattern::Union(Box::new(l), Box::new(r)))
        }
        Algebra::Filter(expr, sub) => {
            let filter = convert_expr(expr)?;
            let pattern = convert_algebra_to_ir(sub)?;
            Ok(Pattern::Filter(filter, Box::new(pattern)))
        }
        Algebra::Graph(graph_name, sub) => {
            let pattern = convert_algebra_to_ir(sub)?;
            let name = match graph_name {
                spargebra::term::NamedNodePattern::NamedNode(n) => n.iri.to_string(),
                spargebra::term::NamedNodePattern::Variable(v) => format!("?{}", v),
            };
            Ok(Pattern::Graph(name, Box::new(pattern)))
        }
        other => Err(ParseError::Unsupported(format!("Algebra {:?}", other))),
    }
}

/// Convert a `spargebra` term into our IR term.
fn convert_term(term: &spargebra::term::TermPattern) -> Term {
    use spargebra::term::{BlankNodePattern, LiteralPattern, NamedNodePattern, TermPattern, VariablePattern};
    match term {
        TermPattern::NamedNode(NamedNodePattern { iri }) => Term::Iri(iri.to_string()),
        TermPattern::BlankNode(BlankNodePattern { id }) => Term::Blank(id.to_string()),
        TermPattern::Literal(LiteralPattern { value, language, datatype }) => {
            // Serialise the literal as lexical form with optional language and datatype
            if let Some(lang) = language {
                Term::Literal(format!("{}@{}", value, lang))
            } else if let Some(dt) = datatype {
                Term::Literal(format!("{}^^{}", value, dt.iri))
            } else {
                Term::Literal(value.clone())
            }
        }
        TermPattern::Variable(VariablePattern { name }) => Term::Variable(name.clone()),
    }
}

/// Convert a `spargebra` expression into a simple filter.  Only equality and
/// inequality comparisons between variables and constants are currently supported.
fn convert_expr(expr: &spargebra::algebra::Expression) -> Result<FilterExpr, ParseError> {
    use spargebra::algebra::Expression;
    match expr {
        Expression::Equal(lhs, rhs) => Ok(FilterExpr::Eq(convert_expr_term(lhs), convert_expr_term(rhs))),
        Expression::NotEqual(lhs, rhs) => Ok(FilterExpr::Neq(convert_expr_term(lhs), convert_expr_term(rhs))),
        other => Err(ParseError::Unsupported(format!("Filter expression {:?}", other))),
    }
}

/// Helper to convert an expression argument (which may be a term or a variable reference)
/// into an IR term.  This is a simplified view; full expression support would
/// require evaluating functions and nested expressions.
fn convert_expr_term(expr: &spargebra::algebra::Expression) -> Term {
    use spargebra::algebra::Expression;
    match expr {
        Expression::Variable(v) => Term::Variable(v.clone()),
        Expression::Constant(term) => convert_term(term),
        // Fallback: serialise the expression as a literal string representation.
        other => Term::Literal(format!("{:?}", other)),
    }
}
