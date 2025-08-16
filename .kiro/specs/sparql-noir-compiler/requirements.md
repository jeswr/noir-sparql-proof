# Requirements Document

## Introduction

This specification defines the requirements for a complete rewrite of the SPARQL query to Noir circuit compiler in Rust. The system will translate SPARQL 1.1 queries into zero-knowledge circuits using the Noir language, enabling privacy-preserving verification of query results over signed RDF datasets without revealing the underlying data.

The compiler takes SPARQL queries and RDF datasets as input and produces Noir circuits that can generate zero-knowledge proofs demonstrating that claimed variable bindings satisfy the query constraints. This enables applications like credential verification, private data queries, and selective disclosure scenarios.

## Requirements

### Requirement 1: Core SPARQL Query Support

**User Story:** As a developer building privacy-preserving applications, I want to compile basic SPARQL queries into Noir circuits, so that I can prove query results without revealing the underlying RDF data.

#### Acceptance Criteria

1. WHEN a SPARQL SELECT query with basic graph patterns is provided THEN the system SHALL parse it into an intermediate representation
2. WHEN the query contains triple patterns with variables and constants THEN the system SHALL correctly identify and encode all terms
3. WHEN the query uses FILTER expressions with equality and comparison operators THEN the system SHALL translate them into circuit constraints
4. WHEN the query includes OPTIONAL patterns THEN the system SHALL generate circuits that handle optional matching semantics
5. WHEN the query contains UNION patterns THEN the system SHALL create circuits with branch selection logic
6. WHEN property paths are used (?, *, +, /, |, ^, !, ^(negation set)) THEN the system SHALL support bounded expansion with configurable depth limits and support negated property sets per SPARQL 1.1
7. WHEN inline data is provided via VALUES/BINDINGS THEN the system SHALL compile it as in-circuit constraints or public inputs with deterministic ordering
8. WHEN SERVICE is used THEN the system SHALL reject it with a clear diagnostic (future oracle support optional)
7. WHEN inline data is provided via VALUES/BINDINGS THEN the system SHALL compile it as in-circuit constraints or public inputs with deterministic ordering
8. WHEN SERVICE is used THEN the system SHALL either reject it with a clear diagnostic or support a future pluggable oracle; it SHALL be documented as not supported by default

### Requirement 2: RDF Term Encoding and Hashing

**User Story:** As a system integrator, I want RDF terms to be deterministically encoded as field elements, so that the same terms always produce identical circuit representations across different compilations.

#### Acceptance Criteria

1. WHEN an IRI is encountered THEN the system SHALL encode it using a deterministic hash function (Blake2s or Poseidon)
2. WHEN a literal is processed THEN the system SHALL decompose it into lexical form, datatype, and language tag components
3. WHEN a blank node appears THEN the system SHALL namespace it by dataset to prevent cross-dataset collisions
4. WHEN numeric literals are used THEN the system SHALL extract canonical numeric representations for arithmetic operations
5. WHEN the same term appears multiple times THEN the system SHALL reuse the same encoding consistently
6. WHEN terms are encoded THEN the system SHALL maintain a mapping between original terms and their field element representations

### Requirement 3: Circuit Generation and Optimization

**User Story:** As a performance-conscious developer, I want the generated Noir circuits to be efficient and auditable, so that proof generation times are reasonable and the circuits can be reviewed for correctness.

#### Acceptance Criteria

1. WHEN generating Noir code THEN the system SHALL produce readable, well-commented circuits
2. WHEN multiple triple patterns exist THEN the system SHALL generate separate membership verification loops for each pattern
3. WHEN variables are shared across patterns THEN the system SHALL enforce consistency through binding equality constraints
4. WHEN filters are present THEN the system SHALL generate appropriate assertion statements
5. WHEN the circuit size exceeds reasonable bounds THEN the system SHALL provide optimization suggestions or warnings
6. WHEN constants are reused THEN the system SHALL factor them into shared definitions

### Requirement 3.1: Open-World Scope (No Global Result Claims)

1. WHEN queries include aggregates (COUNT/SUM/AVG/MIN/MAX), GROUP BY/HAVING, DISTINCT/REDUCED, ORDER BY, LIMIT/OFFSET THEN the compiler SHALL emit a diagnostic that such global claims are not supported in the open-world profile
2. WHEN users desire such features THEN the compiler SHALL suggest enabling a future closed-world mode with result commitments (out of scope here)

### Requirement 4: Merkle Tree Membership Proofs

**User Story:** As a verifier, I want to cryptographically verify that claimed triples exist in the committed datasets, so that I can trust the query results without seeing the raw data.

#### Acceptance Criteria

1. WHEN a dataset is provided THEN the system SHALL compute its Merkle tree root over triple/quadruple hashes
2. WHEN generating proofs THEN the system SHALL include Merkle paths for all required triples
3. WHEN verifying membership THEN the circuit SHALL validate the Merkle inclusion path
7. WHEN non-membership is required by a query (e.g., MINUS, NOT EXISTS) THEN the system SHALL reject it with a diagnostic in the open-world profile
4. WHEN multiple datasets are used THEN the system SHALL handle dataset-specific namespacing for blank nodes
5. WHEN a triple is not found in any dataset THEN the proof generation SHALL fail with a clear error message
6. WHEN Merkle tree depth is configured THEN the system SHALL respect the specified depth limits

### Requirement 5: Multi-Dataset and Signature Support

**User Story:** As a credential verifier, I want to verify queries over multiple signed datasets from different issuers, so that I can validate complex scenarios involving multiple data sources.

#### Acceptance Criteria

1. WHEN multiple datasets are provided THEN the system SHALL verify each dataset's signature independently
2. WHEN datasets have different signers THEN the system SHALL validate against the appropriate public keys
3. WHEN blank nodes appear in multiple datasets THEN the system SHALL maintain proper namespace isolation
4. WHEN a query spans multiple datasets THEN the system SHALL generate appropriate cross-dataset constraints
5. WHEN signature verification fails THEN the system SHALL reject the dataset with a clear error message
6. WHEN public keys are provided THEN the system SHALL integrate ECDSA verification into the circuit
7. WHEN named graphs are used THEN the system SHALL ensure graph labels are part of the dataset commitment to prevent cross-graph collisions

### Requirement 6: Intermediate Representation (IR) Design

**User Story:** As a compiler maintainer, I want a clean intermediate representation that separates parsing from code generation, so that I can easily extend and debug the compiler.

#### Acceptance Criteria

1. WHEN SPARQL algebra is parsed THEN the system SHALL convert it to a normalized IR
2. WHEN the IR is created THEN it SHALL preserve all semantic information needed for code generation
3. WHEN expressions are processed THEN the system SHALL maintain metadata about types and coercions
4. WHEN patterns are analyzed THEN the system SHALL identify variable scopes and dependencies
5. WHEN the IR is serialized THEN it SHALL produce deterministic, cacheable representations
6. WHEN debugging is needed THEN the system SHALL provide traceability from IR back to original SPARQL
7. WHEN subqueries are present without aggregates/modifiers THEN the IR SHALL support nested ProgramIR with clear scoping and projection
8. WHEN aggregates, GROUP BY, HAVING, DISTINCT, ORDER BY are present THEN the compiler SHALL emit a diagnostic in the open-world profile

### Requirement 7: Type System and Coercion Handling

**User Story:** As a query author, I want the system to handle SPARQL's type system correctly, so that numeric comparisons, string operations, and boolean logic work as expected.

#### Acceptance Criteria

1. WHEN numeric literals are compared THEN the system SHALL perform appropriate type coercion
2. WHEN string operations are used THEN the system SHALL handle language tags and datatypes correctly
3. WHEN boolean expressions are evaluated THEN the system SHALL implement SPARQL's effective boolean value rules
4. WHEN type mismatches occur THEN the system SHALL provide clear error messages
5. WHEN XSD datatypes are encountered THEN the system SHALL support the core XSD type hierarchy
6. WHEN custom datatypes are used THEN the system SHALL handle them as opaque literals with appropriate warnings
7. WHEN sameTerm and term equality are used THEN the system SHALL implement strict term-encoding equality distinct from value equality

### Requirement 8: Error Handling and Diagnostics

**User Story:** As a developer debugging query compilation issues, I want clear error messages and diagnostic information, so that I can quickly identify and fix problems.

#### Acceptance Criteria

1. WHEN parsing fails THEN the system SHALL provide specific error locations and suggestions
2. WHEN unsupported SPARQL features are used THEN the system SHALL clearly indicate what is not supported
3. WHEN circuit generation fails THEN the system SHALL explain the cause and potential solutions
4. WHEN witness generation fails THEN the system SHALL identify which constraints cannot be satisfied
5. WHEN performance issues arise THEN the system SHALL provide profiling information and optimization hints
6. WHEN debugging is enabled THEN the system SHALL output detailed compilation traces
7. WHEN a SPARQL feature is not supported in the open-world profile (e.g., MINUS, NOT EXISTS, aggregates) THEN the system SHALL emit a clear diagnostic with guidance

### Requirement 9: Configuration and Extensibility

**User Story:** As a system administrator, I want to configure compilation parameters and extend the system with new operators, so that I can adapt it to different use cases and performance requirements.

#### Acceptance Criteria

1. WHEN configuring the compiler THEN the system SHALL allow setting hash functions, Merkle depths, and array sizes
2. WHEN adding new SPARQL operators THEN the system SHALL provide a plugin mechanism for extensions
3. WHEN performance tuning is needed THEN the system SHALL expose relevant compilation parameters
4. WHEN different backends are required THEN the system SHALL support pluggable code generators
5. WHEN caching is enabled THEN the system SHALL cache compiled circuits based on query and configuration hashes
6. WHEN deployment environments vary THEN the system SHALL support different configuration profiles
7. WHEN string/regex bounds are required THEN the system SHALL expose maximum string lengths, regex sizes, and language tag length limits

### Requirement 10: Testing and Validation Framework

**User Story:** As a quality assurance engineer, I want comprehensive testing capabilities, so that I can validate the compiler's correctness across different query types and edge cases.

#### Acceptance Criteria

1. WHEN running tests THEN the system SHALL include unit tests for all major components
2. WHEN validating correctness THEN the system SHALL include integration tests with known query/dataset pairs
3. WHEN testing edge cases THEN the system SHALL handle malformed queries, empty datasets, and boundary conditions
4. WHEN performance testing THEN the system SHALL include benchmarks for compilation and proof generation times
5. WHEN regression testing THEN the system SHALL maintain a suite of test cases that prevent breaking changes
6. WHEN property-based testing THEN the system SHALL include generators for random valid queries and datasets
7. WHEN rejecting non-OWA features THEN the system SHALL include tests that ensure proper diagnostics for MINUS/NOT EXISTS and aggregates/modifiers

### Requirement 11: Command-Line Interface and Tooling

**User Story:** As an end user, I want a command-line tool that makes it easy to compile queries, generate proofs, and verify results, so that I can integrate the system into my workflows.

#### Acceptance Criteria

1. WHEN using the CLI THEN the system SHALL provide commands for compile, prove, and verify operations
2. WHEN compiling queries THEN the system SHALL accept SPARQL files and output Noir circuits
3. WHEN generating proofs THEN the system SHALL accept datasets and bindings to produce proof artifacts
4. WHEN verifying proofs THEN the system SHALL validate proofs against public inputs and return clear results
5. WHEN debugging is needed THEN the system SHALL provide verbose output modes and intermediate file inspection
6. WHEN integrating with other tools THEN the system SHALL support standard input/output formats and exit codes
7. WHEN rejecting non-OWA features THEN the CLI SHALL surface clear diagnostics and exit codes

### Requirement 12: Documentation and Examples

**User Story:** As a new user of the system, I want comprehensive documentation and examples, so that I can quickly understand how to use the compiler effectively.

#### Acceptance Criteria

1. WHEN learning the system THEN users SHALL have access to a comprehensive user guide
2. WHEN implementing integrations THEN developers SHALL have access to API documentation
3. WHEN troubleshooting issues THEN users SHALL have access to a troubleshooting guide with common problems
4. WHEN exploring capabilities THEN users SHALL have access to example queries and datasets
5. WHEN understanding the theory THEN users SHALL have access to documentation explaining the cryptographic foundations
6. WHEN contributing to the project THEN developers SHALL have access to architecture documentation and contribution guidelines

### Requirement 13: SPARQL 1.1 OWA Profile Addendum

1. WHEN MINUS and FILTER NOT EXISTS appear THEN the system SHALL reject them with a diagnostic (not supported in OWA profile)
2. WHEN REGEX and advanced string functions are used THEN the system SHALL support them under configurable bounds and document any Unicode limitations
3. WHEN named graphs (GRAPH, FROM NAMED) are used THEN the system SHALL compile graph-aware quadruple matching
4. WHEN subqueries without aggregates/modifiers are used THEN the system SHALL compile nested IR; otherwise emit a diagnostic
5. WHEN negated property sets are used in paths THEN the system SHALL compile predicate-set inequality constraints consistent with SPARQL 1.1