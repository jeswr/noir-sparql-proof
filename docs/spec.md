# Noir SPARQL Proof – Re‑Write Specification

## 1. Objective
Implement a modular SPARQL→ZKP pipeline that produces a zero‑knowledge proof per solution binding showing that reported variable bindings satisfy a SPARQL 1.1 query over one or more signed RDF credential datasets, without revealing non‑projected data.

## 2. High‑Level Pipeline
1. Inputs: SPARQL query, credential set (each: Merkle root + signature + namespace id), public key set.
2. Parse → SPARQL Algebra.
3. Normalize (operator rewriting, path expansion, OPTIONAL + UNION normalization, filter pushdown).
4. Semantic analysis (variable scope, dependency graph, join groups, optional guards).
5. IR construction (Patterns, Expressions, Constraints, Membership, Witness spec).
6. Term encoding (deterministic field representation of RDF terms / literal decomposition).
7. Membership planning (which triples must be proven, dataset root association, blank node namespacing).
8. Circuit IR → Noir code (operators, membership checks, constraint assertions).
9. Enumeration of solution bindings (external engine or internal evaluator).
10. For each binding: witness build → proof generation.
11. Verification: proof + projected bindings + roots + signatures.

## 3. Functional Scope (Phase 1)
Supported initially:
- Triple patterns (default graph)
- Property paths: `| / ^ ? * +` (bounded expansion depth config)
- FILTER: `= != < > <= >=`, logical `&& || !`, `BOUND`, `isIRI`, `isBlank`, `isLiteral`, `LANG`
- OPTIONAL (left join semantics)
- UNION (binary / n‑ary via flatten)
- BIND (simple expression)
- Multi credential roots + signatures (blank node namespace isolation)
- Deterministic term encoding (NamedNode, BlankNode, Literal, DefaultGraph)

Deferred (Phase 2+): Aggregates, ORDER/LIMIT, EXISTS, GRAPH/SERVICE, ASK/CONSTRUCT, full XSD numeric promotion, advanced functions, subqueries.

## 4. Non‑Functional Requirements
- Deterministic IR hashing for cache.
- Modular operator registration (extensible table).
- 90%+ unit test coverage for transformation & IR.
- Proof time target < 10s for ≤5 triple patterns, ≤2 credentials, depth ≤16.
- No leakage of non‑projected term data in public inputs.
- Readable, auditable code layout.

## 4.1 Design Constraints (Added)
To maximise auditability and extensibility the compiler implementation MUST follow these additional constraints:
1. Functional Style
   - Core transformation passes implemented as pure functions: `State -> Result` (no hidden mutation). 
   - All side effects (file IO, hashing, logging) isolated at thin orchestration layer.
   - Pass composition achieved via function pipelines (e.g. `normalize |> annotate |> planMembership |> planCoercions |> assembleConstraints`).
   - Immutable persistent data structures (JS objects treated immutably; helper utilities create new copies rather than mutating in place).
   - Deterministic ordering guaranteed by explicit sort operations rather than insertion side effects.
2. Declarative Operator Semantics Table
   - Operators defined in `operators/registry.ts` as data: 
     ```ts
     interface OperatorSemantics {
       op: SparqlOperator;                         // from @comunica
       arity: number | { min: number; max: number };
       categories: ValueCategory[][];              // accepted arg category sets (alternatives)
       resultCategory: ValueCategory | ((args: ValueCategory[]) => ValueCategory);
       coercions: ((args: ExprMeta[]) => NormalisationStep[]) | NormalisationStep[];
       ebv: boolean;                               // result is directly EBV if true
       lower: 'inline' | 'gadget:numeric_cmp' | 'gadget:string_eq' | string; // lowering tag
       notes?: string;                             // human audit notes / spec references
       specRef: string;                            // SPARQL spec section anchor
     }
     ```
   - Adding a new operator requires only inserting a new entry + (if needed) a gadget template, no changes to core passes.
   - Validation pass cross‑checks algebra operator usage against registry (arity, category).
   - Coercion planner assembled by concatenating `coercions` outputs from matched semantics entries.
3. Traceability
   - Each constraint embeds `source` metadata linking to operator registry entry (where applicable) and original algebra JSON pointer.
4. Test Generation from Semantics
   - Registry drives automatic generation of positive/negative unit tests (e.g. invalid arity, invalid datatype combinations) to ensure coverage parity with specifications.

## 5. Architecture Layers
| Layer | Module | Responsibility |
|-------|--------|----------------|
| Parsing/Normalization | `src/algebra/` | Translate + rewrite operators + expand paths + normalize OPTIONAL/UNION |
| Semantic Analysis | `src/analysis/` | Variable collection, dependency graph, join ordering hints, optional guards |
| IR Core | `src/ir/` | PatternIR, ExprIR, ConstraintIR, MembershipIR, WitnessSpec, serialization |
| Encoding | `src/encoding/` | Term & literal decomposition to fields, caching |
| Crypto | `src/crypto/` | Hash function abstraction, Merkle verify, signature verify |
| Backend Codegen | `src/backend/noir/` | IR→Noir lowering, templates, operator impls |
| Runtime | `src/runtime/` | Binding enumeration, witness builder, proof orchestrator |
| Verification SDK | `src/verify/` | Proof verification wrapper |
| CLI | `src/cli/` | build/sign/prove/verify commands |

## 6. IR (Intermediate Representation)
### 6.1 PatternIR
```
PatternIR {
  id: string,
  subject: TermIR,
  predicate: TermIR,
  object: TermIR,
  graph: TermIR (default graph placeholder),
  optionalGroup?: string,     // group id if part of OPTIONAL branch
  unionBranch?: string,       // branch id if part of UNION
  origin: { pathExpanded?: boolean, depth?: number }
}
```
### 6.2 ExprIR
DAG nodes: `VarRef(name) | Const(termEncoding) | Op(code, args[])` with static type info (Numeric, Boolean, Term, LangTag, Unknown).
### 6.3 ConstraintIR
```
Eq(a,b) | And[list] | Or[list] | Not(inner) | Implies(a,b) |
Membership(patternId, datasetIndex) |
OperatorEval(exprId) | Branch(selectorBits[], branchConstraints[])
```
OPTIONAL handled via guard g: constraints as `Implies(g, localConstraint)`; unbound vars resolved by guard.
UNION lowered to selector bits s_i (Σ s_i = 1) plus guarded branch constraints.
### 6.4 WitnessSpec
```
WitnessSpec {
  public: { queryHash, roots[], projectedVariables{}, operatorSetVersion, pubKeys[] },
  private: { tripleMemberships[], literalParts[], selectorBits, auxNumeric[] },
  derived: { patternId -> triple component equality bindings }
}
```
### 6.5 Serialization
Stable JSON with sorted keys; hashed (e.g. blake2s) to produce `programId` for caching compiled Noir.

## 7. Term & Literal Encoding
```
TermEncoding = hash2([ termTypeTag, valueField ])
Literal valueField = hash4([ lexicalHash, semanticValueOrCanonical, langHash, datatypeHash ])
```
- termTypeTag: NamedNode=0, BlankNode=1, Literal=2, DefaultGraph=3
- lexicalHash = stringHash(lexicalForm)
- semanticValueOrCanonical: numeric normalization or boolean bit; else lexicalHash
- langHash: 0 if none; else stringHash(lowercased language tag)
- datatypeHash: stringHash(datatype IRI)
Blank nodes: valueField = hash2([ namespaceId, stringHash(label) ])

## 8. Membership Proofs
Triple commitment: `hash4([ subjEnc, predEnc, objEnc, graphEnc ])`
For each required triple: leaf inclusion path (path[], directions[], depth fixed per dataset config). Noir verifies inclusion relative to dataset root.

## 9. Constraints Mapping
- Triple pattern variable binding: equality between variable field and BGP triple component field.
- FILTER expressions compiled to ExprIR then to primitive constraints; numeric comparisons ensure canonical numeric extraction (add hidden extraction nodes if needed).
- OPTIONAL: guard g = conjunction of membership success for optional patterns (or explicit presence bit). Each filter / binding referencing optional vars guarded.
- UNION: selector bits; per-branch constraints guarded; projected vars unify via sum(s_i * branchVar_i) or equalities if constant across branches.
- BIND: variable equality with compiled expression result.
- LANG: extraction ensures literal decomposition; provides langHash; equality on language tag uses hashed field.

## 10. Operator Registry
`operators.ts` exports table:
```
interface OperatorSpec {
  code: string; arity: number; category: 'compare'|'logical'|'type'|'lang'|'numeric';
  lower(exprIds[]) => ConstraintIR | ExprIR;
  typeCheck(argTypes[]) => resultType;
}
```
Supports extension without touching core lowering.

## 11. Multi‑Credential Handling
Input: array of credentials { root, signature, pubKeyIndex, namespaceId }.
- Validate signature per root.
- Namespace id included in blank node encoding.
- Pattern membership references datasetIndex.
- Optionally allow same triple to appear in multiple datasets (OR membership) future.

## 12. Noir Backend Codegen
Generated files (example):
- `types.nr`: Term, Triple, Credential structs
- `merkle.nr`: generic merkle verify (param depth)
- `operators.nr`: arithmetic / logical helpers
- `constraints.nr`: auto‑generated assertions
- `main.nr`: entrypoint wiring (public/private witness structs)
Compilation steps:
1. Emit constants (hash function selectors, merkle depth, programId).
2. Emit operator implementations required by IR (tree‑shaken by usage scan).
3. Emit membership verification loops.
4. Emit constraint assertions in stable order.

## 13. Runtime Flow
1. Precompile circuit (cache by programId).
2. Enumerate bindings using existing SPARQL engine (Comunica) executed on plaintext dataset union; filter again with same normalization to ensure parity.
3. For each binding:
   - Resolve required triples + their dataset provenance.
   - Fetch merkle paths + directions (precomputed index or on demand).
   - Build witness (public, private, derived).
   - Execute Noir → witness → generate proof.
4. Output: { binding, proof, roots[], programId }.

## 14. Verification Flow
1. Load compiled verifier (or universal verifying key for backend).
2. Recompute projected variable encodings from provided binding.
3. Check signatures on roots (public).
4. Verify proof with public inputs.

## 15. Performance Strategies
- Cache term encodings & literal decompositions (LRU keyed by RDFJS Term).
- Batch path computation for shared triples across bindings.
- Factor common subexpressions in ExprIR (hash consing).
- Flatten deep AND/OR trees before Noir emission.
- Hoist frequently reused literals into a precomputed table inside circuit.

## 16. Security / Soundness
- Every variable binding used in constraints must trace to at least one membership triple or constant expression; static validation pass.
- No direct exposure of original strings: only hashed or canonical numeric field forms published.
- Blank node namespace isolation mandatory.
- Signature verify enforced in circuit before accepting root.

## 17. Testing Strategy
Unit:
- Operator rewriting (snapshots)
- Path expansion (SEQ, +, *, ? cases)
- OPTIONAL guard generation
- UNION selector correctness
- Literal encoding invariants
Integration:
- Query → IR → Noir compile → sample dataset proof
- Negative: modified path, altered binding value, wrong root
Property:
- Random literal normalization round trips
- Random UNION / OPTIONAL compositions (bounded size)
Fixtures:
- SPARQL manifest subset for basic patterns

## 18. Migration Plan
1. Introduce IR modules parallel to existing `generateFunctional*`.
2. Implement encoding consolidation (reuse current encode.ts logic; abstract hash selection).
3. Implement minimal lowering (triple patterns + FILTER equality) & prove equivalence with current generator on sample queries.
4. Extend feature coverage incrementally (OPTIONAL → UNION → paths → BIND → comparisons).
5. Replace old codegen in CLI after parity tests.
6. Remove legacy modules.

## 19. Milestones
M1: Triple patterns + equality FILTER + single dataset.
M2: OPTIONAL + UNION + comparisons + paths (?, /).
M3: Remaining path ops (*, +, |, ^) + multi‑credential + BIND + LANG/type tests.
M4: Optimization pass (factorization, caching) + extended operators.
M5: Aggregates, ASK/CONSTRUCT groundwork.

## 20. Open Questions
- Path repetition bounding policy (static config vs heuristic by dataset size).
- Circuit size minimization for large UNION: selector bits vs multi‑proof composition.
- Off‑chain DISTINCT enforcement (document assumptions) or in‑circuit uniqueness.
- Support for partial disclosure of only subset of projected variables (future selective reveal variant).

## 21. Acceptance Criteria (Phase 1)
Given a SELECT query with ≤5 triple patterns, OPTIONAL, UNION (≤2 branches), FILTER ( =, >, < ), BIND simple, over one credential root:
- System outputs Noir circuit + per‑binding proofs.
- Tampering with any membership path invalidates proof.
- Replacing a projected variable value invalidates proof.
- Removing required FILTER satisfaction invalidates proof.

---
End of specification.
