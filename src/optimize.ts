// @ts-ignore
import { AND, OR, simplify, NOT, TRUE, FALSE } from '@fordi-org/bsimp';
import { CircomTerm, Constraint } from './types.js';
import { getIndex } from './termId.js';

// Rather than hashing just use the actual serialisation
function hashTerm(term: CircomTerm): string {
  switch (term.type) {
    case "variable": return term.value;
    case "input": return `input[${term.value[0]}]`;
    case "static": return `static[${getIndex(term.value).join(",")}]`;
    case "computed": return `computed[${hashTerm(term.input)}][${term.computedType}]`;
    case "computedBinary": return `computedBinary[${hashTerm(term.left)}][${hashTerm(term.right)}][${term.computedType}]`;
  }
}

function hashConstraint(left: Constraint): string {
  switch (left.type) {
    case "all":
      return 'all(' + left.constraints.map(hashConstraint).sort().join(",") + ')';
    case "some":
      return 'some(' + left.constraints.map(hashConstraint).sort().join(",") + ')';
    case "not":
      return 'not(' + hashConstraint(left.constraint) + ')';
    case "=":
      return '=(' + hashTerm(left.left) + ',' + hashTerm(left.right) + ')';
    case "unary":
      return left.operator + '(' + hashTerm(left.constraint) + ')';
    case "boolean":
      return left.value ? 'true' : 'false';
  }
}

export function optimize(constraint: Constraint): Constraint {
  const map: Record<symbol, Constraint> = {};
  
  const toSymbol = (constraint: Constraint) => {
    map[Symbol.for(hashConstraint(constraint))] = constraint;
    return Symbol.for(hashConstraint(constraint));
  }

  const toExpression = (constraint: Constraint): symbol[] | symbol => {
    switch (constraint.type) {
      case "all":
        return [AND, ...constraint.constraints.map(toExpression)];
      case "some":
        return [OR, ...constraint.constraints.map(toExpression)];
      case "not":
        return [NOT, toExpression(constraint.constraint)];
      case "boolean":
        return constraint.value ? TRUE : FALSE;
      default:
        return toSymbol(constraint);
    }
  }

  const fromExpression = (expr: symbol[] | symbol): Constraint => {
    if (typeof expr === 'symbol') {
      if (expr === TRUE) return { type: "boolean", value: true };
      if (expr === FALSE) return { type: "boolean", value: false };
      if (map[expr] === undefined) {
        throw new Error(`Unknown symbol: ${String(expr)}`);
      }
      return map[expr];
    }
    const [op, ...args] = expr;
    switch (op) {
      case AND:
        return { type: "all", constraints: args.map(symbol => fromExpression(symbol)) };
      case OR:
        return { type: "some", constraints: args.map(symbol => fromExpression(symbol)) };
      case NOT:
        return { type: "not", constraint: fromExpression(args[0]) };
      default:
        throw new Error(`Unknown operator: ${String(op)}`);
    }
  }

  return fromExpression(simplify(toExpression(constraint)))
}
