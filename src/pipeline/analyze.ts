import { Algebra } from 'sparqlalgebrajs';

export interface Analysis { variables: Set<string>; }

export function analyze(op: Algebra.Operation): Analysis {
  const vars = new Set<string>();
  if (op.type === 'project') op.variables.forEach(v => vars.add(v.value));
  return { variables: vars };
}
