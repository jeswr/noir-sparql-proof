# Implementation Plan

[ ] 

- Set up Rust project structure with proper module organization
- Configure Cargo.toml with required dependencies (spargebra, blake2, hex, thiserror, serde)
- Implement core error types and configuration structures
- Set up logging and basic CLI argument parsing
- _Requirements: 8.1, 8.2, 9.1, 11.1_

- [ ] 1.1 Create project structure and dependencies

  - Initialize new Rust project with proper directory structure matching design
  - Add all required dependencies to Cargo.toml with appropriate feature flags
  - Create lib.rs with public API exports and module declarations
  - _Requirements: 8.1, 9.1_
- [ ] 1.2 Implement core error handling system

  - Define hierarchical error types (CompilerError, ParseError, etc.) using thiserror
  - Implement error context and suggestion mechanisms
  - Create error formatting for user-friendly messages
  - _Requirements: 8.1, 8.2, 8.4_
- [ ] 1.3 Create configuration system

  - Implement CompilerConfig struct with all configuration options
  - Add serde support for configuration serialization/deserialization
  - Create configuration validation and default value handling
  - _Requirements: 9.1, 9.3, 9.6_
- [ ] 

  - Implement deterministic RDF term encoding using Blake2s
  - Create literal decomposition for numeric and typed literals
  - Build encoding cache with LRU eviction policy
  - Add comprehensive tests for encoding determinism and correctness
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_
- [ ] 2.1 Implement core term encoding traits and types

  - Define TermType enum and TermEncoding struct
  - Create TermEncoder trait with Blake2sEncoder implementation
  - Implement deterministic hashing for IRIs, blank nodes, and simple literals
  - _Requirements: 2.1, 2.5, 2.6_
- [ ] 2.2 Add literal decomposition and canonicalization

  - Implement LiteralComponents struct with lexical, semantic, datatype, and language components
  - Add support for numeric literal canonical forms (integers, decimals) with proper field encoding
  - Handle boolean literals, string length computation, and type classification flags
  - Create witness generation for literal components needed by different SPARQL operations
  - _Requirements: 2.2, 2.4, 7.1, 7.2_
- [ ] 2.3 Create blank node namespacing system

  - Implement dataset-specific blank node namespace isolation
  - Add namespace ID integration into blank node encoding
  - Ensure cross-dataset blank node collision prevention
  - _Requirements: 2.3, 5.3_
- [ ] 2.4 Build encoding cache and performance optimization

  - Implement LRU cache for term encodings to improve performance
  - Add cache statistics and monitoring capabilities
  - Create cache serialization for persistent storage across compilations
  - _Requirements: 2.5, 2.6_
- [ ] 

  - Integrate spargebra for SPARQL parsing into algebra
  - Implement property path decomposition for recursive circuit generation
  - Create path operation analysis for unbounded path support
  - Add query normalization and circuit planning
  - _Requirements: 1.1, 1.6, 6.1, 6.2_
- [ ] 3.1 Create SPARQL parser integration

  - Wrap spargebra parser with error handling and validation
  - Convert spargebra algebra types to internal representations
  - Add support for SELECT queries with basic graph patterns
  - _Requirements: 1.1, 6.1_
- [ ] 3.2 Implement property path decomposition

  - Create PathOperation enum for recursive path representation
  - Implement path analysis to identify recursive vs. bounded paths
  - Add circuit decomposition strategy for different path types
  - _Requirements: 1.6_
- [ ] 3.3 Add query normalization and circuit planning

  - Create operator rewriting rules for equivalent SPARQL forms
  - Implement circuit decomposition planning for recursive proofs
  - Add optimization hints for recursive vs. monolithic circuit generation
  - Add configurable depth limits to prevent infinite expansion with union-based bounded expansion
  - Create path expansion that generates selector bits for different path lengths
  - Generate intermediate variable bindings for multi-step paths
  - _Requirements: 1.6_
- [ ] 

  - Design and implement core IR data structures (ProgramIR, PatternIR, ConstraintIR)
  - Create IR builder that converts normalized SPARQL algebra to IR
  - Add IR serialization with deterministic ordering for caching
  - Implement IR validation and consistency checking
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
- [ ] 4.1 Define core IR data structures

  - Implement ProgramIR, PatternIR, and ConstraintIR types
  - Create TermPlaceholder and ValueRef types for term references
  - Add ExpressionMeta for expression metadata and type information
  - _Requirements: 6.1, 6.3_
- [ ] 4.2 Build IR construction from SPARQL algebra

  - Implement IRBuilder trait with conversion from spargebra algebra
  - Handle basic graph patterns, joins, unions, and optional patterns
  - Convert FILTER expressions to constraint IR with proper scoping
  - _Requirements: 6.2, 6.4_
- [ ] 4.3 Add IR serialization and caching support

  - Implement deterministic JSON serialization with sorted keys
  - Create IR hashing for cache key generation
  - Add IR deserialization with validation
  - _Requirements: 6.5_
- [ ] 4.4 Create IR validation and consistency checks

  - Implement variable scope validation across patterns
  - Add constraint consistency checking
  - Create IR well-formedness validation rules
  - _Requirements: 6.4_
- [ ] 

  - Implement variable analysis (scoping, dependencies)
  - Create type inference system for SPARQL expressions
  - Add coercion planning for numeric and string operations
  - Build expression metadata collection and validation
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
- [ ] 5.1 Implement variable analysis

  - Create variable scope analysis for SPARQL patterns
  - Build dependency graph for variable relationships
  - Add variable binding validation across joins and unions
  - _Requirements: 6.4_
- [ ] 5.2 Build type inference system

  - Implement ValueCategory classification for expressions
  - Create type inference rules for SPARQL operators
  - Add type compatibility checking for operations
  - _Requirements: 7.1, 7.4_
- [ ] 5.3 Add coercion and normalization planning

  - Implement CoercionStep generation for type conversions
  - Create numeric canonicalization rules
  - Add effective boolean value (EBV) coercion handling
  - _Requirements: 7.1, 7.2, 7.3_
- [ ] 5.4 Create expression metadata system

  - Build ExpressionMeta collection from SPARQL expressions
  - Add static value computation for constant expressions
  - Implement expression dependency tracking
  - _Requirements: 6.3, 7.5, 7.6_
- [ ] 

  - Implement Merkle tree construction for RDF datasets
  - Create membership requirement analysis from IR patterns
  - Build witness specification generation for required proofs
  - Add multi-dataset support with proper namespacing
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 5.1, 5.2, 5.3, 5.4_
- [ ] 6.1 Implement Merkle tree construction (inclusion only)

  - Create Merkle tree builder for RDF triple/quad datasets
  - Implement configurable tree depth and hashing functions
  - Add Merkle path generation for individual triples
  - _Requirements: 4.1, 4.6_
- [ ] 6.2 Build membership requirement analysis

  - Analyze IR patterns to determine required triple memberships
  - Create MembershipPlan with dataset associations
  - Handle optional patterns with conditional membership requirements
  - _Requirements: 4.2, 4.4_
- [ ] 6.3 Add multi-dataset support

  - Implement dataset-specific Merkle tree management
  - Create proper blank node namespacing across datasets
  - Add dataset signature verification integration
  - _Requirements: 5.1, 5.2, 5.3, 5.4_
- [ ] 6.4 Create witness specification generation

  - Build WitnessSpec from membership requirements and IR
  - Generate public and private witness layouts
  - Add derived witness computation specifications
  - _Requirements: 4.3, 4.5_
- [ ] 

  - Implement hierarchical Noir circuit generator with recursive proof support
  - Create base circuits for atomic operations and recursive circuits for complex patterns
  - Add circuit templates for path traversal, multi-dataset queries, and aggregation
  - Generate Noir code with proper recursive verification calls
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
- [ ] 7.1 Create core Noir code generator

  - Implement NoirCodeGenerator with template-based generation
  - Create code generation context and state management
  - Add basic circuit structure generation (types, constants, main function)
  - _Requirements: 3.1, 3.6_
- [ ] 7.2 Implement pattern-specific code generation

  - Generate Merkle membership verification loops with candidate triple matching
  - Create variable binding constraint generation with proper term encoding verification
  - Add selector bit logic for OPTIONAL patterns with conditional constraint execution
  - Implement UNION pattern handling with branch selection and variable unification
  - Generate property path verification with bounded expansion and intermediate node handling
  - Support negated property sets in property paths via predicate-set inequalities
  - _Requirements: 3.2, 3.3, 1.4, 1.5, 1.6_
- [ ] 7.3 Add expression and filter code generation

  - Implement SPARQL expression evaluation in Noir with type-aware operations
  - Create filter assertion generation for numeric comparisons, string operations, and type tests
  - Add support for effective boolean value (EBV) evaluation according to SPARQL semantics
  - Generate conditional logic for complex filter expressions with proper short-circuiting
  - _Requirements: 3.4, 7.1, 7.2, 7.3_
- [ ] 7.4 Create complete circuit template and witness generation

  - Implement main circuit function template with proper public/private input structure
  - Generate witness layout specification matching circuit requirements
  - Create witness generation logic that finds candidate triples and computes Merkle paths
  - Add witness validation to ensure circuit inputs are consistent and complete
  - _Requirements: 3.1, 4.3, 4.5_
- [ ] 7.5 Build circuit optimization system

  - Implement common subexpression elimination for repeated term encodings
  - Add constant folding for pre-computed hashes and dead code elimination
  - Create conditional execution optimization for optional patterns and filters
  - Implement batch operations for Merkle path verification
  - _Requirements: 3.5_
- [ ] 

  - Add comprehensive FILTER expression support (equality, comparisons, boolean logic)
  - Implement OPTIONAL pattern handling with proper semantics
  - Create UNION pattern support with branch selection
  - Add BIND expression support for variable assignment
  - Add GRAPH and named graph matching
  - Add REGEX and bounded string ops support
  - Add VALUES/BINDINGS support as inline bindings
  - Define SERVICE handling policy (diagnostic by default; oracle plugin as future)
  - _Requirements: 1.2, 1.3, 1.4, 1.5_
- [ ] 8.1 Implement comprehensive FILTER support

  - Add support for all comparison operators (=, !=, <, >, <=, >=)
  - Implement boolean logic operators (&&, ||, !) with proper EBV handling
  - Create type-specific comparison logic for numerics, strings, dates, and term equality vs sameTerm
  - _Requirements: 1.2_
- [ ] 8.2 Add OPTIONAL pattern semantics

  - Implement left-join semantics for OPTIONAL patterns
  - Create optional guard generation for conditional constraints
  - Add proper variable binding handling for unmatched optional patterns
  - _Requirements: 1.4_
- [ ] 8.3 Create UNION pattern support

  - Implement branch selection logic with selector bits
  - Add constraint generation for union branches
  - Create variable binding unification across union branches
  - _Requirements: 1.5_
- [ ] 8.4 Add BIND expression support

  - Implement variable assignment from expressions
  - Create BIND constraint generation in IR
  - Add BIND expression evaluation in generated circuits
  - _Requirements: 1.5_
- [ ] 8.5 Add named graphs

  - Extend PatternIR to include graph and compile GRAPH/FROM/FROM NAMED semantics
  - _Requirements: 13.3, 5.3, 5.7_
- [ ] 8.6 Add string/regex bounded gadgets

  - Implement configurable MAX_STR_LEN, MAX_REGEX_STATES; byte-array witnesses bound by config
  - Add REGEX, CONTAINS, STRSTARTS, STRENDS, SUBSTR, REPLACE, UCASE/LCASE, STRLEN, CONCAT
  - _Requirements: 13.2, 9.7_
- [ ] 

  - Integrate ECDSA signature verification for dataset authentication
  - Add support for multiple datasets with different signers
  - Implement proper public key management and verification
  - Create dataset root commitment and signature validation
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
- [ ] 9.1 Implement ECDSA signature verification

  - Integrate k256 crate for ECDSA signature operations
  - Create signature verification utilities for dataset authentication
  - Add public key management and validation
  - _Requirements: 5.2, 5.6_
- [ ] 9.2 Add multi-dataset signature support

  - Implement per-dataset signature verification
  - Create public key to dataset mapping
  - Add signature validation in circuit generation
  - _Requirements: 5.1, 5.3_
- [ ] 9.3 Create dataset root commitment system

  - Implement dataset root computation from Merkle trees
  - Add root commitment verification in circuits
  - Create dataset integrity validation
  - _Requirements: 5.4_
- [ ] 9.4 Named graph integrity

  - Ensure graph label inclusion in Merkle leaf hashing and signature scope
  - Add tests for cross-graph collision resistance
  - _Requirements: 5.7, 13.3_
- [ ] 

  - Build comprehensive CLI with compile, prove, and verify commands
  - Add configuration file support and command-line option parsing
  - Implement verbose output modes and debugging features
  - Create integration with Noir compiler (nargo) for circuit compilation
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6_
- [ ] 10.1 Create basic CLI structure

  - Implement command-line argument parsing with clap
  - Create subcommands for compile, prove, and verify operations
  - Add global options for configuration and verbosity
  - _Requirements: 11.1, 11.5_
- [ ] 10.2 Implement compile command

  - Create SPARQL query compilation from file or stdin
  - Add Noir circuit output with configurable paths
  - Implement configuration file loading and validation
  - _Requirements: 11.2_
- [ ] 10.3 Add prove and verify commands

  - Implement proof generation from datasets and bindings
  - Create proof verification with public inputs
  - Add integration with nargo for circuit compilation and execution
  - _Requirements: 11.3, 11.4_
- [ ] 10.5 Non-OWA feature diagnostics

  - CLI diagnostics for MINUS/NOT EXISTS and aggregates/modifiers when encountered
  - Exit codes and suggestions pointing to future closed-world mode
  - _Requirements: 3.1, 11.7_
- [ ] 10.4 Build debugging and diagnostic features

  - Add verbose output modes with compilation traces
  - Create intermediate file inspection capabilities
  - Implement error reporting with suggestions and context
  - _Requirements: 11.5_
- [ ] 

  - Create comprehensive unit test suite for all modules
  - Build integration tests with end-to-end query compilation
  - Add property-based tests for encoding determinism
  - Implement performance benchmarks and regression tests
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
- [ ] 11.1 Build unit test framework

  - Create unit tests for all core modules (parser, IR, encoding, codegen)
  - Add test utilities and mock implementations for external dependencies
  - Implement test data generators for various SPARQL constructs
  - _Requirements: 10.1_
- [ ] 11.2 Create integration test suite

  - Build end-to-end tests from SPARQL queries to Noir circuits
  - Add test cases for all supported SPARQL features
  - Create validation against reference SPARQL engines where possible
  - _Requirements: 10.2_
- [ ] 11.2.1 Add tests for OWA rejections

  - Ensure MINUS and FILTER NOT EXISTS produce clear diagnostics
  - Ensure aggregates and modifiers produce clear diagnostics
  - _Requirements: 13.1, 3.1, 8.7_

// (Global commitments out of scope in OWA profile)

- [ ] 11.3 Add property-based and fuzz testing

  - Implement property-based tests for encoding determinism
  - Create fuzz testing for parser robustness
  - Add randomized query generation for stress testing
  - _Requirements: 10.3, 10.5_
- [ ] 11.4 Build performance and benchmark suite

  - Create compilation time benchmarks for various query complexities
  - Add memory usage profiling and optimization validation
  - Implement regression testing for performance characteristics
  - _Requirements: 10.4_
- [ ] 

  - Write comprehensive API documentation with rustdoc
  - Create user guide with examples and tutorials
  - Build troubleshooting guide with common issues and solutions
  - Add architecture documentation for contributors
  - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6_
- [ ] 12.1 Create API documentation

  - Add comprehensive rustdoc comments to all public APIs
  - Create code examples for major functionality
  - Build API reference documentation with cargo doc
  - _Requirements: 12.2_
- [ ] 12.2 Write user guide and tutorials

  - Create getting started guide with installation and basic usage
  - Add tutorial covering common SPARQL query patterns
  - Build examples repository with sample queries and datasets
  - _Requirements: 12.1, 12.4_
- [ ] 12.3 Build troubleshooting and FAQ documentation

  - Create troubleshooting guide for common compilation issues
  - Add FAQ covering typical user questions and edge cases
  - Build error message reference with solutions
  - _Requirements: 12.3_
- [ ] 12.4 Add architecture and contributor documentation

  - Write architecture overview explaining design decisions
  - Create contributor guide with development setup and guidelines
  - Add code style guide and review process documentation
  - _Requirements: 12.6_
