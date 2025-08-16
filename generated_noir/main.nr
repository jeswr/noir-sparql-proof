// Auto-generated Noir (prototype) from ProgramIR
// queryHash: a2af93f4fbf07f94fdfcf66644ed5c720ded6a787444a98f1c27d885c97f1f78
pub struct Triple { terms: [Field; 3] }
pub struct MerkleProof { path: [Field; MERKLE_DEPTH], dirs: [Field; MERKLE_DEPTH] }
global MERKLE_DEPTH = 11;
pub struct Witness { bgp: BGP, proofs: [MerkleProof; 1] }
pub type BGP = [Triple; 1];
pub struct Variables {
  pub s: Field,
}

fn assert_eq(a: Field, b: Field, msg: str) { assert(a == b, msg); }
fn assert_bool(cond: bool, msg: str) { assert(cond, msg); }

pub fn generated_check(bgp: BGP, variables: Variables, roots: [Field;1], proofs: [MerkleProof; 1]) {
  // verify membership for pattern pat0
  // TODO: implement merkle verification gadget using proofs[0] against roots[0]
  assert(variables.s, bgp[0].terms[0], "var s binding mismatch");
  assert_eq(variables.o, bgp[0].terms[2], "var o binding mismatch");
  // membership constraint for pat0 (implicit in merkle verify)
}
