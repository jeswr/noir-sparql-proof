use crate::types::Triple;

pub(crate) type BGP = [Triple; 3];
pub(crate) type Hidden = [Field; 1];
pub(crate) struct Variables {
  pub(crate) person: Field,
}

pub(crate) fn checkBinding(bgp: BGP, variables: Variables, hidden: Hidden) {
  assert(variables.person == bgp[0].terms[0]);
  assert(variables.person == bgp[1].terms[0]);
  assert(13112853496582548402250403293894075775575986952782995777438832739449823479158 == bgp[0].terms[1]);
  assert(16018520974103573709883001228756682715470173227891251632236534345692745284037 == bgp[1].terms[1]);
  assert(bgp[1].terms[2] == bgp[2].terms[0]);
  assert(10550989180672270807273271654049379004022864183257063556360165688741830398035 == bgp[2].terms[1]);
  assert((variables.person == dep::poseidon2::bn254::hash_2([1, hidden[0]])) == false);
}
