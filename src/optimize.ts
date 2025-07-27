import { SparqlOperator } from "@comunica/utils-expression-evaluator";
// @ts-ignore
import { AND, FALSE, NOT, OR, simplify, TRUE } from '@fordi-org/bsimp';
import { DataFactory as DF } from "n3";
import { Algebra, Factory, toSparql,  } from 'sparqlalgebrajs';
import { operator } from './equivalentOperators.js';
import { simplifyExpressionEBV } from './expressionSimplifier.js';

const fac = new Factory();

const map: [symbol, SparqlOperator][] = [
  [AND, SparqlOperator.LOGICAL_AND],
  [OR, SparqlOperator.LOGICAL_OR],
  [NOT, SparqlOperator.NOT]
];

type NestedSymbol = symbol | NestedSymbol[];

// TODO: Future: implement normalisation (e.g. a = b should be serialised as b = a)
// TODO: Future: implement term re-writing where possible so that simplifyExpressionEBV picks
// up on things like a == a
function toExpression(algebra: Algebra.Expression, store: Record<symbol, Algebra.Expression>): NestedSymbol {
  const op = simplifyExpressionEBV(algebra);

  if (typeof op === 'boolean')
    return op ? TRUE : FALSE;

  if (op.expressionType === Algebra.expressionTypes.OPERATOR) {
    for (const [sym, sparqlOp] of map) {
      if (op.operator === sparqlOp)
        return [sym, ...op.args.map(arg => toExpression(arg, store))];
    }
  }

  const sym = Symbol.for(toSparql(op));
  store[sym] = op;
  return sym;
}

function fromExpression(expr: NestedSymbol, store: Record<symbol, Algebra.Expression>): Algebra.Expression  {
  if (typeof expr === 'symbol') {
    if (expr === TRUE) return fac.createTermExpression(DF.literal('true', DF.namedNode('http://www.w3.org/2001/XMLSchema#boolean')));
    if (expr === FALSE) return fac.createTermExpression(DF.literal('false', DF.namedNode('http://www.w3.org/2001/XMLSchema#boolean')));
    if (store[expr] === undefined) {
      throw new Error(`Unknown symbol: ${String(expr)}`);
    }
    return store[expr];
  }

  const [op, ...args] = expr as NestedSymbol[];
  for (const [sym, sparqlOp] of map) {
    if (op === sym)
      return fac.createOperatorExpression(sparqlOp, args.map(arg => fromExpression(arg, store)));
  }

  throw new Error(`Unknown operator: ${String(op)}`);
}

export function optimizeExpression(expression: Algebra.Expression): Algebra.Expression {
  const store: Record<symbol, Algebra.Expression> = {};
  const expr = toExpression(operator(expression), store);
  const simplified = simplify(expr, store);
  return fromExpression(simplified, store);
}
