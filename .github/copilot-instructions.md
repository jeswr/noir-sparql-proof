# Copilot Project Instructions

These instructions guide AI coding agents working on this repository.

## 1. Big Picture
This project proves SPARQL query results over signed RDF credentials using Noir ZK circuits. Workflow:
1. Input: SPARQL query + RDF dataset(s).
2. Transform query to SPARQL Algebra (sparqlalgebrajs) and build a modular IR (see `src/pipeline/` + `src/ir/`).
3. Encode RDF terms & triples deterministically (hash + type tags) and build Merkle roots (legacy flow in `sign.js`).
4. Generate Noir circuit code (legacy: functional generators; new pipeline: `emitNoir` in `src/backend/noir/emit.ts`).
5. Produce per‑binding proofs (`prove.js`).

There is an ongoing rewrite: new functional, declarative pipeline coexists with legacy monolithic generators under `legacy/`.

## 2. Key Directories
- `src/pipeline/`: New passes (normalize, analyze, expressions, membership, constraints, buildProgram).
- `src/ir/`: IR type definitions & initial builder (ProgramIR, PatternIR, ExprNode, Constraint).
- `src/operators/registry.ts`: Declarative operator semantics table (central source of truth for operators & lowering tags).
- `src/backend/noir/`: Noir backend (current: lowering prototype `lowering.ts`, emitter `emit.ts`).
- `legacy/`: Previous generator code (`generateFunctional*.ts`) excluded from build.
- `noir_prove/`: Existing Noir circuit templates (still used by legacy path).
- `scripts/build-noir-from-ir.mjs`: Generates Noir from new ProgramIR prototype.

## 3. Build & Test Workflows
Commands:
- `npm run build:tsc` – compile TypeScript (excludes `legacy/`).
- `npm run build:noir:ir` – run new IR → Noir prototype (`generated_noir/main.nr`).
- `npm run build:noir` – legacy flow (generate & compile Noir using old generator into `noir_prove/`).
- `npm test` – legacy full pipeline (build + operator tests + sign + prove).
- `npm run test:operators` / `test:integration:operators` – validate operator registry & lowering.
- `npm run test:pipeline` – builds ProgramIR via new passes.

When adding new pipeline code: update `build:tsc` output then create targeted tests under `tests/pipeline/` or `tests/ir/` using only compiled `dist/` imports (avoid ts-node runtime).

## 4. Conventions & Patterns
- Functional passes: each module exports a pure function returning new structures (avoid in-place mutation). Compose in `buildProgram.ts`.
- Expression IDs: prefix `var:`, `const:`, `op:`, `pat:`; constraints reference these IDs.
- Constraints currently minimal: only equality (`Eq`) auto-extracted from `=` operator; extend by adding new `Constraint` variants and emission logic in `emit.ts`.
- Operator semantics: add new operators only by inserting definitions in `registry.ts`; lowering uses `semantics.lower` tags.
- Term encoding & membership proofs: presently handled in legacy flow; new pipeline stubs must integrate encoding and membership verification emission (future work).

## 5. External Dependencies
- SPARQL processing: `sparqlalgebrajs` (translation + algebra utilities).
- Expression semantics: `@comunica/utils-expression-evaluator` (SparqlOperator enum reused for registry).
- Noir: circuits compiled via `nargo` (`noir_prove/` directory); new generator emits standalone Noir file for future integration.
- Crypto & hashing: legacy scripts rely on Poseidon2, Blake2s, secp256k1 (see `sign.js`, `prove.js`).

## 6. Adding Features (Rewrite Path)
1. Implement pass (e.g. OPTIONAL handling) in `src/pipeline/` returning enriched IR fields or additional constraints.
2. Extend `ProgramIR` types if needed; keep fields serializable & deterministic (stable ordering).
3. Add operator(s) in `registry.ts`, then update lowering/emission if requires new Noir gadget.
4. Expand `emit.ts` to output new constraint kinds (add case in `emitConstraint`).
5. Add tests asserting IR JSON shape & emitted Noir snippets (snapshot or string includes).

## 7. Pitfalls / Gotchas
- Do not recompile legacy `generateFunctional*` code—it's excluded; keep it untouched unless fixing legacy path.
- Tests importing TS directly will fail under ESM – always import from `dist/` for automated scripts (except legacy tests already working).
- `sparqlalgebrajs` version differences: filter node shape may differ; guard with flexible property access (see `expressions.ts`).
- Ensure new expression nodes preserve deterministic ID scheme; avoid random IDs (affects reproducible program hash planned later).

## 8. Roadmap Alignment (Phase 1)
Focus now: robust ProgramIR with FILTER comparisons, membership constraints, and Noir emission parity with legacy circuit for simple patterns. Defer aggregates, advanced functions, multi-root until Phase 2.

## 9. Example: Adding a Numeric Comparison
- Add operator (e.g. GTE already present) logic is in registry.
- Ensure expression builder records operator node; buildProgram extracts constraint (extend extraction beyond '=' to numeric cmp).
- Update `emitConstraint` to produce `assert( a > b )` style logic or call dedicated gadget.

## 10. Communication
When modifying core semantics, annotate changes with concise comments referencing spec sections (see `spec.md`). Keep operator notes brief & auditable.

---
Provide feedback if any area needs deeper detail (e.g., encoding specifics, planned membership proof structure) so instructions can be refined.
