import { normalize } from './normalize.js';
import { analyze } from './analyze.js';
import { buildExpressions } from './expressions.js';
import { planMembership } from './membership.js';
import { assembleConstraints } from './constraints.js';
import { ProgramIR, Constraint } from '../ir/types.js';
import crypto from 'crypto';
import { Algebra, toSparql } from 'sparqlalgebrajs';

export function buildProgram(op: Algebra.Operation): ProgramIR {
  const norm = normalize(op).op;
  const analysis = analyze(norm);
  const exprs = buildExpressions(norm).exprs;
  const membership = planMembership(norm);
  const extra: Constraint[] = [];
  // Extract simple equality constraints from operator expressions (Phase 1: '=' only)
  for (const node of Object.values(exprs)) {
    if (node.tag === 'Op' && node.op === '=') {
      if (node.args.length === 2) {
        extra.push({ tag: 'Eq', a: node.args[0], b: node.args[1], source: 'filter:eq' });
      }
    }
  }
  const membershipConstraints: Constraint[] = membership.patterns.map(pat => ({ tag: 'Membership', patternId: pat.id, datasetIndex: 0 }));
  const constraints = assembleConstraints(membershipConstraints, extra);
  return {
    patterns: membership.patterns,
    exprs,
    constraints,
    projected: [...analysis.variables].sort(),
    meta: { queryHash: hash(toSparql(op)), operatorSetVersion: 'v0' }
  };
}

function hash(s: string) { return crypto.createHash('sha256').update(s).digest('hex'); }
