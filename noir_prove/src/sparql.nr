use crate::types::Triple;

pub(crate) type BGP = [Triple; 3];
pub(crate) type Hidden = [Field; 5];
pub(crate) struct Variables {
  pub(crate) person: Field,
  pub(crate) age: Field,
}

pub(crate) fn checkBinding(bgp: BGP, variables: Variables, hidden: Hidden) {
  assert(variables.person == bgp[0].terms[0]);
  assert(variables.age == bgp[0].terms[2]);
  assert(variables.person == bgp[1].terms[0]);
  assert(10933861860104938182078829299080821517398489297748654949784063660458894029192 == bgp[0].terms[1]);
  assert(17306104366712127004102468914826498934223414371773065298117212414330870349397 == bgp[1].terms[1]);
  assert(bgp[1].terms[2] == bgp[2].terms[0]);
  assert(8313629903513261037716482973670331048977275807188631398721013040184826894172 == bgp[2].terms[1]);
  assert(std::hash::pedersen_hash([2, std::hash::pedersen_hash([hidden[0], hidden[1], 638735893058869413402024148085879111143364657497749380190880060567766766509, 1686263426824985399110139734075659485152727784697459471589262910047968709019])]) == variables.age);
  assert(30 >= (hidden[1] as i32));
  assert(std::hash::pedersen_hash([2, std::hash::pedersen_hash([hidden[2], hidden[3], 638735893058869413402024148085879111143364657497749380190880060567766766509, 1686263426824985399110139734075659485152727784697459471589262910047968709019])]) == variables.age);
  assert((hidden[3] as i32) >= 18);
  assert((bgp[1].terms[2] == std::hash::pedersen_hash([1, hidden[4]])) == false);
}
