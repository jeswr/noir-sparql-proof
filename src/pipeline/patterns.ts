import { PatternIR, TermIR } from '../ir/types.js';
import type { Algebra } from 'sparqlalgebrajs';

export function termToIRPattern(p: Algebra.Pattern, index: number): PatternIR {
  return {
    id: `pat${index}`,
    subject: termToIR(p.subject),
    predicate: termToIR(p.predicate),
    object: termToIR(p.object),
    graph: termToIR((p as any).graph || { termType: 'DefaultGraph', value: '' }),
    origin: { algebraRef: `bgp/${index}` },
  };
}

function termToIR(term: any): TermIR {
  return { kind: term.termType || 'DefaultGraph', value: term.value || '' };
}
