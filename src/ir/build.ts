import { toSparql, Algebra, Factory, Util } from 'sparqlalgebrajs';
import { ProgramIR, PatternIR, ExprNode, ExprId } from './types.js';
import crypto from 'crypto';

interface BuildOptions { queryText?: string; }

const factory = new Factory();

export function buildProgramIR(op: Algebra.Operation, options: BuildOptions = {}): ProgramIR {
  if (op.type !== 'project') throw new Error('Only SELECT supported');
  const patterns: PatternIR[] = [];
  const exprs: Record<string, ExprNode> = {};
  const constraints = [] as ProgramIR['constraints'];
  const projected = op.variables.map(v => v.value);

  // Extract basic BGPs (Phase 1: flat)
  Util.mapOperation(op, {
    bgp: (bgp: Algebra.Bgp) => ({
      result: (() => { for (const p of bgp.patterns) { const id = `pat${patterns.length}`; patterns.push({ id, subject: termToIR(p.subject), predicate: termToIR(p.predicate), object: termToIR(p.object), graph: termToIR((p as any).graph || { termType: 'DefaultGraph', value: '' }), origin: { algebraRef: `bgp/${patterns.length}` }, }); } return bgp; })(),
      recurse: false,
    }),
  });

  // Simple variable equality constraints for each triple pattern binding (s,p,o)
  for (const pat of patterns) {
    for (const [component, term] of [['subject', pat.subject], ['predicate', pat.predicate], ['object', pat.object]] as const) {
      if (term.kind === 'Variable') {
        const varExpr = ensureVar(exprs, term.value);
        const tripleExpr = ensureTripleComponent(exprs, pat.id, component);
        constraints.push({ tag: 'Eq', a: varExpr.id, b: tripleExpr.id, source: `${pat.id}.${component}` });
      }
    }
  }

  const queryHash = hash(options.queryText || toSparql(op));
  return {
    patterns,
    exprs,
    constraints,
    projected,
    meta: { queryHash, operatorSetVersion: 'v0' },
  };
}

function termToIR(term: any) {
  return { kind: term.termType === 'Variable' ? 'Variable' : term.termType, value: term.value };
}

function ensureVar(exprs: Record<string, ExprNode>, name: string): ExprNode {
  const id = `var:${name}`;
  if (!exprs[id]) exprs[id] = { tag: 'VarRef', name, id, valueCategory: 'Term' };
  return exprs[id];
}

function ensureTripleComponent(exprs: Record<string, ExprNode>, patternId: string, comp: string): ExprNode {
  const id: ExprId = `pat:${patternId}:${comp}`;
  if (!exprs[id]) exprs[id] = { tag: 'Op', op: 'triple_component', args: [], id, valueCategory: 'Term' };
  return exprs[id];
}

function hash(s: string) { return crypto.createHash('sha256').update(s).digest('hex'); }
