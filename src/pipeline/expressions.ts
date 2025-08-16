import { Algebra, Util } from 'sparqlalgebrajs';
import { ExprNode } from '../ir/types.js';
import { validateOperator } from '../operators/registry.js';

export interface ExpressionBuild { exprs: Record<string, ExprNode>; }

let counter = 0;

export function buildExpressions(op: Algebra.Operation): ExpressionBuild {
  const exprs: Record<string, ExprNode> = {};
  Util.recurseOperation(op, {
    filter: (f) => { const list = (Array.isArray((f as any).expressions) ? (f as any).expressions : [(f as any).expression]).filter(Boolean); for (const expr of list) visit(expr, exprs); return true; },
    extend: (e) => { visit(e.expression, exprs); return true; },
  });
  return { exprs };
}

function visit(expr: Algebra.Expression, map: Record<string, ExprNode>): string {
  switch (expr.expressionType) {
    case 'term': {
      if (expr.term.termType === 'Variable') {
        const id = `var:${expr.term.value}`;
        map[id] ||= { tag: 'VarRef', name: expr.term.value, id, valueCategory: 'Term' };
        return id;
      } else {
        const id = `const:${++counter}`;
        map[id] = { tag: 'Const', encoding: expr.term.value, id, valueCategory: 'Term' };
        return id;
      }
    }
    case 'operator': {
      const op = expr as Algebra.OperatorExpression;
      const argIds = op.args.map(a => visit(a, map));
      // category inference placeholder
      validateOperator(op, argIds.map(()=>'Term'));
      const id = `op:${++counter}`;
      map[id] = { tag: 'Op', op: op.operator, args: argIds, id, valueCategory: 'Term' };
      return id;
    }
    default:
      throw new Error(`UNSUPPORTED_EXPR ${expr.expressionType}`);
  }
}
