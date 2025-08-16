import 'ts-node/register';
import assert from 'assert';
import { SparqlOperator } from '@comunica/utils-expression-evaluator';
import sparqlPkg from 'sparqlalgebrajs';
const { Factory } = sparqlPkg;
const DF = sparqlPkg.DataFactory || sparqlPkg; // fallback
let lowerExpression;
try {
  ({ lowerExpression } = await import('../../dist/backend/noir/lowering.js'));
} catch (e) {
  ({ lowerExpression } = await import('../../src/backend/noir/lowering.ts'));
}

// Simplified exprMeta builder for tests
function buildMeta(expr, id, nextId = { v: 0 }, meta = {}) {
  if (expr.expressionType === 'term') {
    meta[id] = { valueCategory: 'Term' };
  } else if (expr.expressionType === 'operator') {
    const childIds = expr.args.map(() => `e${++nextId.v}`);
    meta[id] = { argIds: childIds, valueCategory: 'Term' };
    expr.args.forEach((a, i) => buildMeta(a, childIds[i], nextId, meta));
  }
  return meta;
}

function makeOp(op, args) {
  const f = new Factory();
  return f.createOperatorExpression(op, args);
}

function lit(val) {
  const f = new Factory();
  // create a simple literal via factory's internal data factory
  return f.createTermExpression(f.dataFactory.literal(String(val)));
}

function testLower(op, argVals, expectSnippetIncludes) {
  const f = new Factory();
  const expr = makeOp(op, argVals.map(lit));
  const meta = buildMeta(expr, 'e0');
  const lowered = lowerExpression(expr, { exprMeta: meta, cache: new Map() }, 'e0');
  for (const inc of expectSnippetIncludes) {
    assert(lowered.code.includes(inc), `Expected lowered code to include ${inc}; got ${lowered.code}`);
  }
  return lowered;
}

// Arithmetic
const add = testLower(SparqlOperator.ADDITION, [1,2], ['+']);
const sub = testLower(SparqlOperator.SUBTRACTION, [5,3], ['-']);
const mul = testLower(SparqlOperator.MULTIPLICATION, [2,4], ['*']);
const div = testLower(SparqlOperator.DIVISION, [6,2], ['safe_div']);

// String
const strlen = testLower(SparqlOperator.STRLEN, ['abc'], ['strlen']);
const ucase = testLower(SparqlOperator.UCASE, ['abc'], ['ucase']);
const lcase = testLower(SparqlOperator.LCASE, ['ABC'], ['lcase']);
const concat = testLower(SparqlOperator.CONCAT, ['a','b'], ['concat']);
const contains = testLower(SparqlOperator.CONTAINS, ['abc','b'], ['contains']);

console.log('Integration operators lowering OK');
