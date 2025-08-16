# SPARQL → Noir Constraint Encoding (Formal Core v3)

Status: Adjusted to Noir assertion idioms (2025-08-10)

## 1. Domains
Let F be the Noir field.
Term sets: IRI, LIT, BN (pairwise disjoint). TERM := IRI ∪ LIT ∪ BN.
Variables VAR (notation ?x).
Triple t ∈ TERM³ written t = (s,p,o).
Dataset D = (t₁,…,t_N) (ordered multiset). Commitment root R ∈ F (public).
Depth m (fixed) for Merkle tree over leaves h_i.

Encoding E : TERM → F injective (deterministic). Write ⟦c⟧ = E(c).
Leaf hash H_leaf : F³ → F (Poseidon). Internal hash H₂ : F² → F.

## 2. Algebra Fragment
Abstract algebra:
Q ::= BGP({tp_k}) | FILTER(Q, Φ) | PROJECT_V(Q) | JOIN(Q,Q)
Triple pattern tp = (α,β,γ) with α,β,γ ∈ TERM ∪ VAR.
Expressions Φ (Milestone 1): only equality atoms (?x = ?y) and constants equality (?x = c).
(Boolean connectives / comparisons postponed.)

## 3. Standard Semantics (Reference)
Solution μ : VAR ⇀ TERM satisfies pattern (α,β,γ) iff some (s,p,o) ∈ D matches component‑wise:
- α constant ⇒ α = s; α = ?x ⇒ μ(?x)=s; similarly β,γ.
BGP: all patterns satisfied with a single consistent μ.
FILTER: all atoms true under μ. PROJECT: domain restriction.

## 4. Translation ⟦Q⟧ → Noir Artifacts
We produce Noir code (single function per query) plus witness layout:
(W, Assertions, Pub) where assertions are implemented via Noir `assert` helpers (no raw `constrain`).

### 4.1 Witness Allocation
Let Vars(Q) = {v₁,…,v_V}. Allocate field witnesses W_v (array `vars: [Field; V]`).
For each triple pattern tp_k allocate witnesses S_k,P_k,O_k (encoded term fields) and its Merkle authentication path:
- siblings: A_k[j] : Field for j=0..m-1
- direction bits: D_k[j] : bool  (left/right indicator at level j)
No separate bit constraints needed: `bool` type is enforced by compiler.
Intermediate hashes R_k^j (j=0..m) as unconstrained temporaries inside the function (not external inputs).

### 4.2 Structural Bindings
For each component selector comp ∈ {S,P,O} in pattern k with term τ:
- τ constant c: `assert_eq(comp_k, ⟦c⟧, "const match")`.
- τ variable ?x: `assert_eq(comp_k, W_x, "var ?x binding")`.
Joins emerge from re‑using the same W_x across patterns; no extra code.

### 4.3 Membership (Merkle Path)
Leaf: `let leaf = H_leaf(S_k, P_k, O_k); let mut acc = leaf;`
For j in 0..m-1:
```
let sib = A_k[j];
let dir = D_k[j];            // bool
// If dir == false: current node is left child → hash(acc, sib)
// If dir == true : current node is right child → hash(sib, acc)
let next = if dir { H₂(sib, acc) } else { H₂(acc, sib) };  // branching allowed; compiler lowers
acc = next;
```
Root check: `assert_eq(acc, R, "merkle root mismatch");`

(If branching over `bool` introduces unwanted selector cost, alternative arithmetic blend is permitted:
`let left_hash = H₂(acc, sib); let right_hash = H₂(sib, acc); let next = right_hash * (dir as Field) + left_hash * (1 - (dir as Field));` then assign `acc = next;`.)

### 4.4 Filter Equalities (Milestone 1)
For each atom (?x = ?y): `assert_eq(W_x, W_y, "filter ?x=?y");`
For atom (?x = c): `assert_eq(W_x, ⟦c⟧, "filter ?x=c");`
No EBV coercion logic yet; all atoms must hold.

### 4.5 Projection (Optional Row Hash)
If projecting variables P = (p₁,…,p_r) we may publish a commitment:
`let row_hash = Poseidon([ W_{p₁}, …, W_{p_r} ]);`
Returned or asserted against a public input: `assert_eq(row_hash, row_hash_pub, "row hash");`

### 4.6 Assertion Helpers
Generated once (or reused from a shared prelude):
```
fn assert_eq(a: Field, b: Field, msg: str) { assert(a == b, msg); }
fn assert_bool(c: bool, msg: str) { assert(c, msg); }
```
`assert_bool` used only if we compute boolean formulas (future). Direction bits already typed as `bool` so no explicit bit-range assertion required; if represented as `Field` instead, enforce with `assert_eq(d * (d - 1), 0, "bit");`.

### 4.7 Function Skeleton
```
struct Pattern { s: Field, p: Field, o: Field, sibs: [Field; m], dirs: [bool; m] }

fn prove_row(root: Field,
             vars: [Field; V],      // provides W_v witnesses
             patterns: [Pattern; K],
             row_hash_pub: Field) -> Field { // returns row_hash (can also be pub input)
  // For each pattern k:
  //   structural bindings (4.2)
  //   merkle path (4.3)
  // Filters (4.4)
  // Optional row hash (4.5)
  row_hash
}
```

## 5. Soundness / Completeness (Sketch)
Given μ satisfying algebra semantics, choose witness values mapping each variable ?x to ⟦μ(?x)⟧ and pattern witnesses as the concrete encoded triple selected from D with its valid path; all assertions pass. Conversely any satisfying witness set induces μ via variable field values; structural assertions guarantee consistent triple components; membership assertions guarantee each triple exists under root R; filters enforce equality predicates. Hence equivalence holds for the supported fragment.

## 6. Extension Hooks
- Comparisons (<, ≤, >, ≥): allocate boolean result b; compute with Noir ordering gadget / library; `assert_bool(b, "cmp");` Replace filter equality emission with generic visitor.
- Boolean connectives: represent each atom’s boolean value and compose with `if` / arithmetic; final `assert_bool(filter_result, "filter");`.
- OPTIONAL: enable bit e_k (bool) gating pattern assertions: `if e_k { …pattern assertions… }`; each variable occurrence guarded by presence logic (future formalization).
- UNION: branch bits b₁,b₂ (bool) with `assert_bool(!(b₁ && b₂) && (b₁ || b₂), "union mux");` multiply (or conditionally execute) branch‑local assertions.
- Aggregates: row folding outside single-row circuit or recursive composition; row hash becomes leaf in aggregate Merkle / accumulator.

## 7. Implementation Order (Minimal)
1. Deterministic encoder E + dataset Merkle builder (exports root, per‑triple path).
2. Codegen implementing Sections 4.2–4.5 using only `assert_eq` and simple `if` over bool.
3. Witness builder (JS) producing arrays for a single binding.
4. Tests: valid witness passes; tampered sibling / variable / root each fails; snapshot emitted Noir.

(End)
