use crate::types::Triple;

pub(crate) type BGP = [Triple; 3];
pub(crate) struct Variables {
  pub(crate) person: Field,
}

pub(crate) fn checkBinding(bgp: BGP, variables: Variables) {
  assert(variables.person == bgp[0].terms[0]);
  assert(variables.person == bgp[1].terms[0]);
  assert(3839055153775061364397041471431045838034377586865746803508490555724117943588 == bgp[0].terms[1]);
  assert(13528573203257741085357757583117277223354373727727460101431238032456165703466 == bgp[1].terms[1]);
  assert(bgp[1].terms[2] == bgp[2].terms[0]);
  assert(19667111123673001040462170548016185467783951576357474311920828448402302709273 == bgp[2].terms[1]);
}
