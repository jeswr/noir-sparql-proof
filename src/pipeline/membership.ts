import { ProgramIR } from '../ir/types.js';
import { Algebra, Util } from 'sparqlalgebrajs';
import { termToIRPattern } from './patterns.js';
import { PatternIR } from '../ir/types.js';

export interface MembershipPlan { patterns: PatternIR[]; }

export function planMembership(op: Algebra.Operation): MembershipPlan {
  const patterns: PatternIR[] = [];
  Util.recurseOperation(op, {
    bgp: (bgp) => { for (const p of bgp.patterns) patterns.push(termToIRPattern(p, patterns.length)); return true; }
  });
  return { patterns };
}
