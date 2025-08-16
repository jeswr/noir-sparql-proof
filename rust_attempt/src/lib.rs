//! Library entry point for the SPARQL‑to‑Noir compiler.
//!
//! This crate exposes modules for parsing SPARQL queries into an intermediate
//! representation (`ir`), converting SPARQL algebra into that IR (`parser`),
//! and generating Noir code (`codegen`).  Users can combine these pieces to
//! build a complete compiler.  An example workflow is:
//!
//! ```rust
//! use zk_sparql_noir::{parser::parse_query_to_ir, codegen::{generate_noir, CodeGenConfig}};
//!
//! let query_str = "SELECT ?name WHERE { ?x <http://xmlns.com/foaf/0.1/name> ?name }";
//! let ir_query = parse_query_to_ir(query_str).expect("parse error");
//! let config = CodeGenConfig::new(vec![4]);
//! let noir_code = generate_noir(&ir_query, &config);
//! println!("{}", noir_code);
//! ```
//!
//! Note: The generated Noir program uses Blake2s hashes of IRIs and literals
//! to encode RDF terms as field elements.  Candidate triple arrays and
//! bindings must be provided as inputs when executing the circuit.

pub mod ir;
pub mod parser;
pub mod codegen;

// Re‑export commonly used types for convenience.
pub use ir::{Query, Pattern, FilterExpr, TriplePattern, Term};
pub use parser::{parse_query_to_ir, ParseError};
pub use codegen::{generate_noir, CodeGenConfig};