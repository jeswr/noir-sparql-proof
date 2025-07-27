# SPARQL 1.1 to Noir Circuit Compiler - New Approach

## Overview

This document describes the new approach implemented in `generateFunctional3.ts` for compiling SPARQL 1.1 queries to Noir circuits. This implementation provides comprehensive SPARQL 1.1 support while maintaining security and readability.

## Key Improvements Over Previous Approaches

### 1. **Comprehensive SPARQL 1.1 Support**

The new implementation supports a much wider range of SPARQL 1.1 features:

#### Supported Operators
- **Logical Operators**: `AND`, `OR`, `NOT`
- **Comparison Operators**: `=`, `!=`, `>`, `<`, `>=`, `<=`
- **Type Checking**: `isIRI()`, `isBLANK()`, `isLITERAL()`
- **String Functions**: `lang()`, `str()`
- **Numeric Functions**: `abs()`, `round()`, `ceil()`, `floor()`
- **List Operators**: `IN`, `NOT IN`
- **Conditional**: `IF`

#### Supported SPARQL Operations
- **Basic Graph Patterns (BGP)**
- **FILTER expressions**
- **BIND expressions**
- **JOIN operations**
- **EXTEND operations**
- **PROJECT operations**
- **Path expressions** (ZeroOrOnePath, OneOrMorePath, ZeroOrMorePath)

### 2. **Enhanced Security**

#### Simplified Constraint Generation
- Clear separation between term evaluation and constraint generation
- Reduced complexity in hidden input management
- Type-safe expression evaluation

#### Improved Error Handling
- Comprehensive error messages for unsupported features
- Graceful degradation for complex expressions
- Clear validation of operator arguments

### 3. **Better Code Organization**

#### Modular Design
```typescript
interface CircuitContext {
  variables: Set<string>;
  bindings: Map<string, Algebra.TermExpression>;
  constraints: Constraint[];
  hiddenInputs: Algebra.TermExpression[];
  inputPatterns: Algebra.Pattern[];
  optionalPatterns: Algebra.Pattern[];
  computedTerms: Map<string, Algebra.TermExpression>;
}
```

#### Expression Evaluation Pipeline
1. **Expression Parsing**: Convert SPARQL expressions to internal representation
2. **Operator Normalization**: Use `equivalentOperators` for consistent handling
3. **Type-Safe Evaluation**: Evaluate expressions with proper type checking
4. **Constraint Generation**: Generate circuit constraints from expressions

## Architecture

### Core Components

#### 1. Expression Evaluator
```typescript
function evaluateExpression(expr: Algebra.Expression, context: CircuitContext): ExpressionResult
```
- Handles all SPARQL expression types
- Supports term expressions and operator expressions
- Returns both the evaluated term and generated constraints

#### 2. Operator Handlers
Specialized handlers for different operator types:
- `evaluateLogicalOperator()` - AND, OR
- `evaluateComparisonOperator()` - =, !=, >, <, >=, <=
- `evaluateTypeCheckOperator()` - isIRI, isBLANK, isLITERAL
- `evaluateStringFunction()` - lang, str
- `evaluateNumericFunction()` - abs, round, ceil, floor
- `evaluateListOperator()` - IN, NOT IN

#### 3. Pattern Handler
```typescript
function handlePatterns(patterns: (Algebra.Pattern | Algebra.Path)[], context: CircuitContext)
```
- Processes basic graph patterns
- Handles path expressions
- Manages variable bindings and constraints

#### 4. Operation Handlers
- `handleFilter()` - Process FILTER expressions
- `handleExtend()` - Process BIND expressions
- `handleJoin()` - Process JOIN operations
- `handleProject()` - Process PROJECT operations

### Circuit Generation

#### Constraint Serialization
```typescript
function serializeConstraint(constraint: Constraint, context: CircuitContext): string
```
- Converts internal constraints to Noir code
- Handles logical operators, comparisons, and type checks
- Generates optimized circuit constraints

#### Term Serialization
```typescript
function serializeTerm(term: Algebra.TermExpression, context: CircuitContext): string
```
- Converts Algebra.TermExpression to Noir field expressions
- Handles static values, variables, and computed terms
- Supports numeric and string operations

## Supported SPARQL 1.1 Features

### 1. Basic Graph Patterns
```sparql
SELECT ?person WHERE {
  ?person foaf:name ?name .
  ?person foaf:age ?age .
}
```

### 2. FILTER Expressions
```sparql
SELECT ?person WHERE {
  ?person foaf:name ?name .
  FILTER(isIRI(?person))
  FILTER(?age > 18)
  FILTER(lang(?name) = "en")
}
```

### 3. BIND Expressions
```sparql
SELECT ?person ?isLiteral WHERE {
  ?person foaf:name ?name .
  BIND(isLiteral(?name) AS ?isLiteral)
}
```

### 4. Complex Logical Expressions
```sparql
SELECT ?person WHERE {
  ?person foaf:name ?name .
  FILTER(
    (isIRI(?person) && isLITERAL(?name)) &&
    (?age > 18 && ?age <= 65) &&
    (lang(?name) = "en" || lang(?name) = "fr")
  )
}
```

### 5. List Operations
```sparql
SELECT ?person WHERE {
  ?person foaf:name ?name .
  FILTER(?name IN ("Alice"@en, "Bob"@en))
  FILTER(?name NOT IN ("Admin"@en))
}
```

### 6. Path Expressions
```sparql
SELECT ?person WHERE {
  ?person foaf:knows? ?friend .
}
```

## Security Considerations

### 1. Input Validation
- All expressions are validated before processing
- Operator argument counts are verified
- Type checking is enforced throughout

### 2. Constraint Simplification
- Complex expressions are broken down into simple constraints
- Redundant constraints are eliminated through optimization
- Hidden inputs are minimized

### 3. Error Handling
- Comprehensive error messages for debugging
- Graceful handling of unsupported features
- Clear separation of concerns

## Performance Optimizations

### 1. Expression Optimization
- Uses `optimizeExpression()` for constraint simplification
- Eliminates redundant constraints
- Optimizes logical expressions

### 2. Term Deduplication
- Computed terms are cached to avoid regeneration
- Hidden inputs are shared where possible
- Variable bindings are optimized

### 3. Circuit Size Reduction
- Minimal hidden inputs
- Efficient constraint generation
- Optimized Noir code generation

## Usage Example

```typescript
import { generateCircuit } from './src/generateFunctional3.js';

// Generate circuit from SPARQL query
const result = generateCircuit('./inputs/sparql.rq');

// Access generated files
console.log(result.circuit); // Noir circuit code
console.log(result.main);    // Main verification code
console.log(result.metadata); // Circuit metadata
```

## Comparison with Previous Approaches

### generateFunctional.ts
**Issues:**
- Limited operator support
- Complex hidden input management
- Inconsistent constraint generation
- Poor error handling

**Improvements in generateFunctional3.ts:**
- Comprehensive SPARQL 1.1 support
- Simplified constraint generation
- Better error handling
- Type-safe evaluation

### generateFunctional2.ts
**Issues:**
- Incomplete implementation
- Limited functionality
- Poor documentation

**Improvements in generateFunctional3.ts:**
- Complete implementation
- Comprehensive feature support
- Clear documentation
- Security-focused design

## Future Enhancements

### 1. Additional SPARQL Features
- **Aggregation functions**: COUNT, SUM, AVG, etc.
- **Subqueries**: Nested SELECT queries
- **Property paths**: More complex path expressions
- **Federated queries**: Multiple data sources

### 2. Performance Improvements
- **Parallel processing**: Concurrent expression evaluation
- **Caching**: Memoization of computed terms
- **Lazy evaluation**: Deferred constraint generation

### 3. Security Enhancements
- **Input sanitization**: Enhanced validation
- **Constraint verification**: Formal verification of generated constraints
- **Audit logging**: Detailed processing logs

## Conclusion

The new `generateFunctional3.ts` implementation provides a significant improvement over previous approaches by offering:

1. **Comprehensive SPARQL 1.1 support** with all major operators and functions
2. **Enhanced security** through simplified constraint generation and better error handling
3. **Improved maintainability** with clear code organization and documentation
4. **Better performance** through optimized constraint generation and term handling

This implementation is ready for security analysis and provides a solid foundation for further SPARQL 1.1 feature development.