import { SparqlOperator } from "@comunica/utils-expression-evaluator";
import { Algebra, Factory } from "sparqlalgebrajs";
import { DataFactory as DF } from "n3";
import { simplifyExpressionEBV } from "./expressionSimplifier";

const factory = new Factory();

export function operator(op: Algebra.Expression): Algebra.Expression {
  const simplified = simplifyExpressionEBV(op);

  if (typeof simplified === 'boolean')
    return factory.createTermExpression(DF.literal(simplified ? 'true' : 'false', DF.namedNode('http://www.w3.org/2001/XMLSchema#boolean')));

  if (op.expressionType !== Algebra.expressionTypes.OPERATOR) {
    return op;
  }

  switch (op.operator) {
    case SparqlOperator.NOT_IN:
    case SparqlOperator.IN:
      const inExpr = factory.createOperatorExpression(SparqlOperator.LOGICAL_OR, op.args.slice(1).map(expr =>
        operator(factory.createOperatorExpression(SparqlOperator.EQUAL, [op.args[0], expr]))
      ));
      return op.operator === SparqlOperator.NOT_IN
        ? factory.createOperatorExpression(SparqlOperator.NOT, [inExpr])
        : inExpr;
    case SparqlOperator.IS_LITERAL:
      return factory.createOperatorExpression(SparqlOperator.NOT,
        [
          factory.createOperatorExpression(SparqlOperator.LOGICAL_OR,
            [SparqlOperator.IS_IRI, SparqlOperator.IS_BLANK].map(iop =>
              factory.createOperatorExpression(iop, [operator(op.args[0])])
            ),
          ),
        ] 
      );
    case SparqlOperator.LT:
      return factory.createOperatorExpression(SparqlOperator.GT, [operator(op.args[1]), operator(op.args[0])]);
    case SparqlOperator.LTE:
    case SparqlOperator.GTE:
      const args = (op.operator === SparqlOperator.LTE) ? [operator(op.args[1]), operator(op.args[0])] : op.args;
      return factory.createOperatorExpression(SparqlOperator.LOGICAL_OR, [
        factory.createOperatorExpression(SparqlOperator.GT, args),
        factory.createOperatorExpression(SparqlOperator.EQUAL, args)
      ]);
    case SparqlOperator.IS_URI:
      return factory.createOperatorExpression(SparqlOperator.IS_IRI, [operator(op.args[0])]);
    case SparqlOperator.NOT_EQUAL:
      return factory.createOperatorExpression(SparqlOperator.NOT,
        [operator(factory.createOperatorExpression(SparqlOperator.EQUAL, op.args))]
      );
    case SparqlOperator.EQUAL:
      let [left, right] = op.args.map(arg => simplifyExpressionEBV(arg));
      if (typeof left === 'boolean' && typeof right !== 'boolean')
        return left ? right : factory.createOperatorExpression(SparqlOperator.NOT, [operator(right)]);
      else if (typeof right === 'boolean' && typeof left !== 'boolean')
        return right ? left : factory.createOperatorExpression(SparqlOperator.NOT, [operator(left)]);
      // TODO add case for re-ordering equalities (e.g. a = b should be serialised as b = a)
    default:
      return op;
  }
}
