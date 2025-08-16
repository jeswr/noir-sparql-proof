import { Algebra } from 'sparqlalgebrajs';
import { validateOperator, ValueCategory, NormalisationStep } from '../../operators/registry.js';

/** Minimal lowering example producing pseudo Noir fragments for a subset of operators. */

export interface LoweredExpr {
  id: string;                // exprId
  code: string;              // Noir snippet returning a Field/boolean
  deps: string[];            // dependent expr ids
  category: ValueCategory;
  coercions: NormalisationStep[];
}

interface LowerCtx {
  exprMeta: Record<string, any>; // ExprMeta from IR (simplified typing here)
  cache: Map<string, LoweredExpr>;
}

export function lowerExpression(expr: Algebra.Expression, ctx: LowerCtx, exprId: string): LoweredExpr {
  if (ctx.cache.has(exprId)) return ctx.cache.get(exprId)!;

  switch (expr.expressionType) {
    case 'term': {
      const code = termToNoir(expr.term);
      const lowered: LoweredExpr = { id: exprId, code, deps: [], category: ctx.exprMeta[exprId].valueCategory, coercions: [] };
      ctx.cache.set(exprId, lowered); return lowered;
    }
    case 'operator': {
      const op = expr as Algebra.OperatorExpression;
      const argIds = ctx.exprMeta[exprId].argIds as string[];
      const loweredArgs = op.args.map((a, i) => lowerExpression(a, ctx, argIds[i]));
      const argCats = loweredArgs.map(a => a.category);
      const { semantics, coercions } = validateOperator(op, argCats);
      // Simple mapping examples
      let code: string;
      switch (semantics.lower) {
        case 'logic_and':
          code = `(${loweredArgs[0].code} & ${loweredArgs[1].code})`;
          break;
        case 'logic_or':
          code = `(${loweredArgs[0].code} | ${loweredArgs[1].code})`;
          break;
        case 'logic_not':
          code = `!(${loweredArgs[0].code})`;
          break;
        case 'eq_term':
          code = `(${loweredArgs[0].code} == ${loweredArgs[1].code})`;
          break;
        case 'cmp_numeric_gt':
          code = `(${loweredArgs[0].code} > ${loweredArgs[1].code})`;
          break;
        case 'cmp_numeric_lt':
          code = `(${loweredArgs[0].code} < ${loweredArgs[1].code})`;
          break;
        case 'cmp_numeric_gte':
          code = `(${loweredArgs[0].code} >= ${loweredArgs[1].code})`;
          break;
        case 'cmp_numeric_lte':
          code = `(${loweredArgs[0].code} <= ${loweredArgs[1].code})`;
          break;
        case 'arith_add':
          code = `(${loweredArgs[0].code} + ${loweredArgs[1].code})`;
          break;
        case 'arith_sub':
          code = `(${loweredArgs[0].code} - ${loweredArgs[1].code})`;
          break;
        case 'arith_mul':
          code = `(${loweredArgs[0].code} * ${loweredArgs[1].code})`;
          break;
        case 'arith_div':
          code = `safe_div(${loweredArgs[0].code}, ${loweredArgs[1].code})`;
          break;
        case 'strlen':
          code = `strlen(${loweredArgs[0].code})`;
          break;
        case 'concat':
          code = `concat(${loweredArgs.map(a=>a.code).join(', ')})`;
          break;
        case 'ucase':
          code = `ucase(${loweredArgs[0].code})`;
          break;
        case 'lcase':
          code = `lcase(${loweredArgs[0].code})`;
          break;
        case 'contains':
          code = `contains(${loweredArgs[0].code}, ${loweredArgs[1].code})`;
          break;
        case 'is_iri':
          code = `is_iri(${loweredArgs[0].code})`;
          break;
        case 'is_blank':
          code = `is_blank(${loweredArgs[0].code})`;
          break;
        case 'is_literal':
          code = `is_literal(${loweredArgs[0].code})`;
          break;
        case 'lang_extract':
          code = `lang_of(${loweredArgs[0].code})`; // placeholder
          break;
        case 'bound_check':
          code = `is_bound(${loweredArgs[0].code})`;
          break;
        default:
          throw new Error(`LOWER_UNSUPPORTED: ${semantics.lower}`);
      }
      const lowered: LoweredExpr = {
        id: exprId,
        code,
        deps: loweredArgs.map(a => a.id),
        category: typeof semantics.result === 'function' ? semantics.result(argCats) : semantics.result,
        coercions,
      };
      ctx.cache.set(exprId, lowered); return lowered;
    }
    default:
      throw new Error(`UNSUPPORTED_EXPRESSION_TYPE: ${expr.expressionType}`);
  }
}

function termToNoir(term: any): string {
  switch (term.termType) {
    case 'Variable': return `var_${term.value}`;
    case 'NamedNode': return `enc_iri_${hashIdent(term.value)}`;
    case 'BlankNode': return `enc_bnode_${hashIdent(term.value)}`;
    case 'Literal': return `enc_lit_${hashIdent(term.value)}`; // Placeholder encoding name
    default: throw new Error(`UNSUPPORTED_TERM: ${term.termType}`);
  }
}

function hashIdent(s: string): string {
  // extremely small deterministic stub (NOT cryptographic)
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) >>> 0; return h.toString(16);
}

export function lowerMany(pairs: { expr: Algebra.Expression; id: string }[], exprMeta: Record<string, any>): LoweredExpr[] {
  const ctx: LowerCtx = { exprMeta, cache: new Map() };
  return pairs.map(p => lowerExpression(p.expr, ctx, p.id));
}
