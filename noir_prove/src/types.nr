use crate::consts::{MERKLE_DEPTH, PATH_DEPTH};

pub(crate) struct Triple {
  pub(crate) terms: [Field; 4],
  pub(crate) path: [Field; MERKLE_DEPTH],
  pub(crate) directions: [u8; MERKLE_DEPTH - 1],
}

pub(crate) struct BGP {
  pub(crate) patterns: [Triple; 3],
}

// Thinking about re-writing for a second (ex:p1/ex:p2)+ => 
fn oneOrMore(path: [[Field; 4]; PATH_DEPTH], subject: Field, predicate: Field, object: Field, instanceDepth: u32) -> bool {
  let mut res = (path[0][0] == subject) & (path[0][1] == predicate) & (path[instanceDepth][2] == object) & (instanceDepth > 0);
  for i in 1..instanceDepth {
    res &= (path[i][0] == path[i-1][2]) & (path[i][1] == predicate);
  }
  res
}

fn zeroOrMore(path: [[Field; 4]; PATH_DEPTH], subject: Field, predicate: Field, object: Field, instanceDepth: u32) -> bool {
  (subject == object) | oneOrMore(path, subject, predicate, object, instanceDepth)
}

fn zeroOrOne(path: [Field; 4], subject: Field, predicate: Field, object: Field) -> bool {
  (subject == object) | ((path[0] == subject) & (path[1] == predicate) & (path[2] == object))
}


