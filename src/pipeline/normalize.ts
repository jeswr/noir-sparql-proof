import { Algebra, Factory, Util } from 'sparqlalgebrajs';
const factory = new Factory();

export interface NormalizedQuery { op: Algebra.Operation; }

// Phase 1: minimal normalization (flatten nested BGPs)
export function normalize(op: Algebra.Operation): NormalizedQuery {
  if (op.type !== 'project') return { op };
  const transformed = Util.mapOperation(op, {
    bgp: (bgp) => ({ result: bgp, recurse: false })
  });
  return { op: transformed };
}
