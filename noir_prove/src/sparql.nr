use crate::types::Triple;

pub(crate) type BGP = [Triple; 1];
pub(crate) struct Variables {
  pub(crate) person: Field,
  pub(crate) name: Field,
}

pub(crate) fn checkBinding(bgp: BGP, variables: Variables) {
  assert(variables.name == bgp[2].terms[2]);
  assert(8313629903513261037716482973670331048977275807188631398721013040184826894172 == bgp[2].terms[1]);
}
