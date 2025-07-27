use crate::types::Triple;

pub(crate) type BGP = [Triple; 1];
pub(crate) type Hidden = [Field; 1];
pub(crate) struct Variables {
  pub(crate) person: Field,
  pub(crate) isLiteral: Field,
}

pub(crate) fn checkBinding(bgp: BGP, variables: Variables, hidden: Hidden) {
  assert(variables.person == bgp[0].terms[0]);
  assert(variables.isLiteral == (((bgp[0].terms[2] == std::hash::pedersen_hash([0, hidden[0]])) | (bgp[0].terms[2] == std::hash::pedersen_hash([1, hidden[0]]))) == false));
  assert(8313629903513261037716482973670331048977275807188631398721013040184826894172 == bgp[0].terms[1]);
}
