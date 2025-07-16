use crate::types::Triple;

pub(crate) type BGP = [Triple; 3];
pub(crate) type Hidden = [Field; 4];
pub(crate) struct Variables {
  pub(crate) person: Field,
}

pub(crate) fn checkBinding(bgp: BGP, variables: Variables, hidden: Hidden) {
  assert(variables.person == bgp[0].terms[0]);
  assert(variables.person == bgp[1].terms[0]);
  assert(3839055153775061364397041471431045838034377586865746803508490555724117943588 == bgp[0].terms[1]);
  assert(13528573203257741085357757583117277223354373727727460101431238032456165703466 == bgp[1].terms[1]);
  assert(bgp[1].terms[2] == bgp[2].terms[0]);
  assert(19667111123673001040462170548016185467783951576357474311920828448402302709273 == bgp[2].terms[1]);
  assert((bgp[1].terms[2] == dep::poseidon2::bn254::hash_2([1, hidden[0]])) == false);
  assert(dep::poseidon2::bn254::hash_2([2, dep::poseidon2::bn254::hash_4([hidden[1], hidden[2], 3606630938142159824850600849621159489092892828859642922597335175060690444644, 9057612174267331027495726139613224656606889342024328972951997029849100616599])]) == bgp[0].terms[2]);
  assert((hidden[2] as u32) >= 18);
  assert(bgp[2].terms[2] == dep::poseidon2::bn254::hash_2([2, dep::poseidon2::bn254::hash_4([hidden[3], hidden[3], 14564235281624879363030375266483479823751371461242095257149412333384986068727, 15864121125590612356704681953762044974063906472592592127867683323251000999323])]));
}
