# Intermediate Representation (IR) Schema (Revised)

This revised IR specification aligns more closely with:
- SPARQL 1.1 Query Language (W3C REC) data model & evaluation semantics
- Existing typings / operator enums from `sparqlalgebrajs` and `@comunica/utils-expression-evaluator`
- Auditability & simplicity (minimise bespoke intermediate layers)

Key changes vs previous draft:
1. Re‑use `Algebra.Expression` trees directly (structural hashing + metadata) instead of redefining operator nodes.
2. Expanded runtime type classification categories reflecting SPARQL term & XSD datatype groups (numeric, date/time, string, boolean, IRI, BlankNode, Literal structural facets, LangTag).
3. Distinguish NamedNode vs BlankNode explicitly in term handling & encoding.
4. Constraint IR simplified: only *structural* boolean logic + membership + variable/term equalities; comparisons & function semantics remain inside `Algebra.Expression` lowered via a uniform expression evaluation gadget.
5. Provide explicit coercion & normalisation table (e.g. numeric promotion, EBV coercion) to keep compiler logic declarative & auditable.
6. Introduce Expression Metadata Layer (EML) rather than bespoke ExprIR union.

---
## 1. Design Principles
- Minimal transformation: retain original SPARQL algebra forms wherever feasible.
- Deterministic: every IR element has canonical JSON & hash.
- Explicit: all coercions & normalisations enumerated in tables (no implicit magical rewrites).
- Auditable: a reviewer can trace any emitted constraint back to a SPARQL algebra fragment + rule.
- Extensible: new datatypes / functions added by extending tables, not altering core structures.

---
## 2. Top Level Structure
```ts
interface ProgramIR {
  meta: ProgramMeta;
  patterns: PatternIR[];          // triple patterns (after path expansion)
  algebra: Algebra.Operation;     // normalized top-level SPARQL algebra (JSON form)
  exprMeta: Record<string, ExprMeta>; // metadata keyed by expression structural hash
  constraints: ConstraintIR[];    // root boolean constraints (implicitly ANDed)
  membership: MembershipPlan;     // triple inclusion requirements
  witness: WitnessSpec;           // public/private/derived layout
  ordering: OrderingInfo;         // stable emission hints
}
```

### 2.1 ProgramMeta
```ts
interface ProgramMeta {
  queryHash: string;                  // hash of canonical SPARQL string
  programVersion: string;             // pipeline semantic version
  createdAt: string;                  // ISO timestamp
  operatorSetVersion: string;         // version tag of supported SPARQL operator set
  config: { maxPathDepth: number; hashFn: 'poseidon2'|'pedersen'|'blake2s'; merkleDepth: number; }; 
}
```

---
## 3. Patterns
```ts
interface TermPlaceholder {
  kind: 'Variable' | 'Constant';
  value: string;                        // variable name OR canonical N-Triples / N-Quads term string
  termType?: 'NamedNode'|'BlankNode'|'Literal'|'DefaultGraph'; // when Constant
  datatypeIri?: string;                 // for literals
  lang?: string;                        // normalised (lowercased) language tag
}

interface PatternIR {
  id: string;                           // p0, p1 ... insertion order after normalization
  subject: TermPlaceholder;
  predicate: TermPlaceholder;
  object: TermPlaceholder;
  graph: TermPlaceholder;               // usually DefaultGraph constant
  origin: {
    fromPath?: boolean;
    pathOpChain?: string[];             // sequence of path operators expanded (e.g. ['SEQ','ZERO_OR_ONE'])
    repetitionDepth?: number;           // depth for * / + expansions
  };
  optionalGroup?: string;               // OPTIONAL group id
  unionBranch?: string;                 // UNION branch id
  datasetAffinity?: number | null;      // fixed dataset index if known, else null
}
```
Blank node treatment: *Do not* collapse BlankNode and NamedNode—preserve distinction for term-type sensitive functions (e.g., `isIRI`, `isBlank`). Namespacing for multi‑credential handled at encoding stage (see Encoding section in main spec).

---
## 4. Expression Handling
### 4.1 Source of Truth
All expressions are native `Algebra.Expression` trees from `sparqlalgebrajs` *post* normalization (operator rewriting, equivalent forms). We do **not** create a parallel operator enum; we rely on `SparqlOperator` (from `@comunica/utils-expression-evaluator`), and term / function expression nodes already defined.

### 4.2 Structural Hash
Each distinct expression subtree is assigned a deterministic structural hash id:
```
exprId = blake2s( canonicalJson(expression) ).slice(0, 16) // hex
```
Used as key in `exprMeta`.

### 4.3 Expression Metadata (ExprMeta)
```ts
interface ExprMeta {
  id: string;                 // exprId
  algebraType: string;        // original Algebra.expressionType
  sparqlOperator?: SparqlOperator; // if operator expression
  argIds?: string[];          // child expr ids
  staticValue?: EncodedLiteral | boolean | number | null; // constant folding result if evaluable
  valueCategory: ValueCategory; // classification (below)
  requires: NormalisationStep[]; // required coercions before evaluation
  ebvSafe: boolean;            // expression can be directly EBV-evaluated without side coercions
}
```

### 4.4 Value Categories (ValueCategory)
Derived from SPARQL spec Section “Operand Data Types” and function/operator expectations.
```ts
type ValueCategory =
  // RDF Term structure
  'IRI' | 'BlankNode' | 'SimpleLiteral' | 'TypedLiteral' | 'NumericInteger' | 'NumericDecimal' |
  'NumericFloatDouble' | 'Boolean' | 'LangString' | 'DateTime' | 'Date' | 'Time' | 'Duration' |
  'StringLike' | 'Term' | 'Error' | 'Unknown';
```
Rules:
- Raw variables begin as 'Term' until refined by context (e.g., inside numeric comparison → promoted to numeric *after* extraction / numeric check constraints).
- Language tagged literal: 'LangString'.
- Numeric canonicalization collapses integer subtypes (xsd:byte, short, int, long, unsigned variants) to 'NumericInteger'.
- float & double unified as 'NumericFloatDouble'; exact canonical mantissa & exponent normalization captured in witness (future extension for strict IEEE semantics; Phase 1 may treat as out‐of‐scope if only integers/decimals supported initially).
- Unknown remains until a required coercion step fails (→ 'Error').

### 4.5 NormalisationStep
```ts
type NormalisationStep =
  | { kind: 'NumericCanonical'; target: 'Integer'|'Decimal'|'FloatDouble'; } 
  | { kind: 'LangTagExtract'; }
  | { kind: 'DatatypeAssert'; datatype: string; } 
  | { kind: 'EBVCoerce'; }           // SPARQL EBV rules application
  | { kind: 'StringToNumericAttempt'; } // for implicit numeric promotion where permitted
  | { kind: 'DateTimeParse'; };
```
Compiler emits constraints enforcing preconditions & implementing transformations inside Noir (hidden inputs for decomposed components where necessary).

### 4.6 Constant Folding
Use `@comunica/expression-evaluator` synchronously on empty bindings to detect pure constants (already partially done in current codebase). If evaluation does not throw, set `staticValue`. Constant expression constraints can be eliminated (except where semantic errors must be preserved → flagged 'Error').

---
## 5. Constraint IR (Simplified)
We restrict to a *minimal* boolean kernel. All higher-level semantics remain in expression algebra nodes + evaluation gadgets.
```ts
type ConstraintIR =
  | { kind: 'AssertExprEBV'; exprId: string; }               // expression must evaluate to true EBV
  | { kind: 'Eq'; left: ValueRef; right: ValueRef; }          // strict field equality
  | { kind: 'Membership'; patternId: string; datasetIndex: number; }
  | { kind: 'And'; items: ConstraintIR[]; }
  | { kind: 'Or'; items: ConstraintIR[]; }
  | { kind: 'Not'; inner: ConstraintIR; }
  | { kind: 'Implies'; premise: ConstraintIR; consequence: ConstraintIR; }
  | { kind: 'Branch'; selectors: string[]; branches: ConstraintIR[][]; } // UNION lowering
  | { kind: 'Guarded'; guard: ConstraintIR; inner: ConstraintIR; }       // OPTIONAL lowering
  | { kind: 'Bind'; variable: string; exprId: string; }                  // BIND assignment
  | { kind: 'TypeAssertion'; exprId: string; category: ValueCategory; }  // ensures runtime type
  | { kind: 'Coercion'; exprId: string; step: NormalisationStep; }       // required pre-eval coercion
```
All numeric comparisons, string functions, date ops, etc. appear as SPARQL operator expressions whose *boolean result* is enforced by `AssertExprEBV` after necessary `TypeAssertion` / `Coercion` constraints.

### 5.1 ValueRef
```ts
type ValueRef =
  | { kind: 'Expr'; id: string }
  | { kind: 'PatternComponent'; patternId: string; position: 0|1|2|3 };
```

### 5.2 Normalization Rules
- `And` / `Or` flattened.
- Constant propagation: if `AssertExprEBV` targets constant false → early unsat flag.
- `Not(AssertExprEBV)` not introduced; instead wrap expression in a NOT algebra operator upstream (so EBV remains centralised).

---
## 6. Membership Plan (Unchanged Conceptually)
```ts
interface MembershipEntry {
  patternId: string;
  datasetIndex: number;
  needBlankNodeNamespace: boolean;  // whether blank node namespace is used for this pattern
}

interface MembershipPlan {
  entries: MembershipEntry[];
  merkleDepths: number[];            // per dataset
}
```
Leaf computation reuses encoding spec (term encoding distinguishes NamedNode vs BlankNode).

---
## 7. Witness Specification (Adjusted for New Steps)
```ts
interface WitnessSpec {
  public: PublicWitnessSpec;
  private: PrivateWitnessSpec;
  derived: DerivedSpec;
}

interface PublicWitnessSpec {
  roots: string[];            // dataset roots
  queryHash: string;          // field element
  projected: string[];        // ordered projected variable names
  operatorSetVersion: string;
  programId: string;          // hash of ProgramIR canonical JSON
  pubKeys: string[];          // signer public keys
}

interface PrivateWitnessSpec {
  memberships: MembershipWitnessSpec[];   // proofs
  literalComponents: LiteralComponentSpec[]; // extracted components
  selectors: SelectorBitSpec[];            // union selector bits
  normalization: NormalizationWitnessSpec[]; // values produced by coercion steps (e.g. numeric canonical)
}

interface NormalizationWitnessSpec {
  exprId: string;
  step: NormalisationStep;    // ties to Coercion constraint
  outputs: string[];          // meaning depends on step (e.g. canonical integer field)
}
```

### 7.1 Literal Components
Support extended datatypes: numeric mantissa/exponent, date parts (year, month, day), time (hour, minute, second, fractional), timezone offset. Each requested only if required by a function/operator.
```ts
interface LiteralComponentSpec {
  exprId: string; // literal term expression
  components: ('lexical'|'numericCanonical'|'lang'|'datatype'|'year'|'month'|'day'|'hour'|'minute'|'second'|'tzOffset')[];
}
```

---
## 8. Serialization & Hashing
Canonicalization now includes serialized `algebra` (SPARQL algebra JSON) instead of decomposed operator list, improving traceability.
Order:
1. meta
2. patterns (id asc)
3. algebra (full JSON)
4. exprMeta (sorted by exprId)
5. constraints (DFS deterministic)
6. membership entries
7. witness spec
→ Hash with configured stringHash (blake2s default) to `programId`.

---
## 9. Type Classification & Coercion Table (Extract)
| SPARQL Datatype(s) | Initial Category | Coercion → Runtime Category | Notes |
|--------------------|------------------|-----------------------------|-------|
| xsd:boolean        | Boolean          | Boolean                     | direct field (0/1) |
| xsd:integer family | TypedLiteral     | NumericInteger              | canonical signed magnitude |
| xsd:decimal        | TypedLiteral     | NumericDecimal              | scaled integer (scale stored) |
| xsd:float/double   | TypedLiteral     | NumericFloatDouble          | (Phase 1: reject; Phase 2: IEEE) |
| xsd:dateTime       | TypedLiteral     | DateTime                    | decomposed Y,M,D,h,m,s, tz |
| xsd:date           | TypedLiteral     | Date                        | Y,M,D, tz? |
| xsd:time           | TypedLiteral     | Time                        | h,m,s, frac, tz |
| rdf:langString     | TypedLiteral     | LangString                  | lang hash + lexical |
| xsd:string / untyped literal | SimpleLiteral | StringLike | lexical hash only |
| IRI term           | IRI              | IRI                         | hashed value |
| Blank node         | BlankNode        | BlankNode                   | namespaced hash |

EBV Coercion (SPARQL spec):
- Boolean: value
- Numeric: false if NaN (future); integer zero ⇒ false else true
- StringLike / SimpleLiteral / LangString: true iff length > 0 (Noir: length > 0 asserted via precomputed length hash or witness component)
- IRI / BlankNode: error (we will treat as evaluation error → constraint unsatisfied)

---
## 10. Lowering Strategy Summary
| Stage | Action |
|-------|--------|
| Normalization | Use existing rewriting (equivalent operators) to reduce forms (e.g. NOT IN expansion) |
| Expression Hashing | Serialize each Algebra.Expression subtree → hash → exprMeta entry |
| Category Inference | Walk expression; assign provisional ValueCategory; add `TypeAssertion` if needed for operator requirements |
| Coercion Planning | Insert `Coercion` constraints + witness allocations for required normalization steps |
| Constraint Assembly | Translate FILTERs to `AssertExprEBV` + needed assertions; OPTIONAL/UNION per previous spec using `Guarded` / `Branch` |
| Membership | Add `Membership` for each concrete pattern used by a binding |
| BIND | `Bind` constraint mapping variable to exprId |

---
## 11. Auditability Aids
- Every constraint carries back‑reference: include `source: { exprId?: string, patternId?: string, sparqlSnippet?: string }` (omitted from core type for brevity above) pointing to original algebra or triple pattern snippet.
- Provide a `trace(programId, variableName)` utility to print path: variable → pattern components / BIND → expressions → constraints.
- Provide canonical SPARQL pretty print of any expression for human review.

---
## 12. Simplifications vs Full Spec (Phase 1)
- Float/Double operations MAY be deferred; encountering them yields build error unless flag `enableFloat` set.
- Date/Time extraction unsupported functions generate `UNSUPPORTED_OPERATOR` unless enabled.
- EBV for non‑supported categories raises early build error.

---
## 13. Error Codes (Updated)
`UNSUPPORTED_OPERATOR`, `TYPE_MISMATCH`, `UNBOUND_VARIABLE`, `INVALID_OPTIONAL`, `UNION_SELECTOR_ARITY`, `COERCION_FAILED`, `UNSUPPORTED_DATATYPE`, `FLOAT_DISABLED`, `EXPRESSION_EBV_ERROR`.

---
## 14. Example (Updated)
SPARQL:
```
SELECT ?s ?o WHERE { ?s <ex:p> ?o OPTIONAL { ?s <ex:q> ?x } FILTER(?o > 5) }
```
- Expression `?o > 5` hashed → exprId `e_ab12cd34` (example).
- exprMeta[e_ab12cd34] = { valueCategory:'Boolean', requires:[ {kind:'NumericCanonical', target:'Integer'} ], ... }
- Constraints include:
  - Membership p0, p1
  - TypeAssertion for `?o` as NumericInteger (coercion adds literalComponents witness if `?o` binds a literal)
  - Coercion step for canonical numeric extraction
  - AssertExprEBV(e_ab12cd34)
  - Guarded( guard=Membership(p1), inner= (no inner eqs shown) )

---
## 15. Implementation Roadmap Adjustments
1. Introduce expression hashing + metadata extraction layer.
2. Replace custom Expr union with direct algebra JSON + metadata classification.
3. Implement ValueCategory inference (table-driven).
4. Implement coercion planner (emits Coercion + TypeAssertion constraints + witness specs).
5. Update Noir backend to:
   - Evaluate expressions via small interpreter gadgets (or inline templates per operator) referencing expr tree & witness components.
   - Enforce type assertions (pattern: prove a tag equality or component shape). 
6. Extend literal component extraction for upcoming date/time support.

---
## 16. Open Items
- Decide between inline per-operator Noir templates vs generic expression interpreter (trade: readability vs size).
- Representation of decimal scale: fixed scaling factor vs (mantissa, scale) pair.
- Handling of DISTINCT (out-of-circuit vs circuit commitment) still postponed.
- Potential factoring of multiple `TypeAssertion` constraints on same expr into single composite assertion.

---
End of revised IR schema.
