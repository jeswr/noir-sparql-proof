import assert from 'assert';
import { SparqlOperator } from '@comunica/utils-expression-evaluator';
import { getOperator, validateOperator } from '../dist/operators/registry.js';

function test(name, fn) {
  try { fn(); console.log('ok -', name); } catch (e) { console.error('fail -', name, e); process.exitCode = 1; }
}

// Basic presence
for (const op of [SparqlOperator.LOGICAL_AND, SparqlOperator.LOGICAL_OR, SparqlOperator.NOT, SparqlOperator.EQUAL]) {
  test(`registry contains ${op}`, () => {
    assert.ok(getOperator(op), 'operator missing');
  });
}

// Arity validation
import sparqlPkg from 'sparqlalgebrajs';
const { Factory } = sparqlPkg;
const fac = new Factory();

function dummyVar(name) { return fac.createTermExpression({ termType: 'Variable', value: name }); }

const andExpr = fac.createOperatorExpression(SparqlOperator.LOGICAL_AND, [dummyVar('a'), dummyVar('b')]);

// Minimal argCategories stub (Boolean for logical ops)
const categories = ['Boolean', 'Boolean'];

test('validate logical AND', () => {
  const res = validateOperator(andExpr, categories);
  assert.equal(res.semantics.op, SparqlOperator.LOGICAL_AND);
});

// Equality test (broad signature)
const eqExpr = fac.createOperatorExpression(SparqlOperator.EQUAL, [dummyVar('x'), dummyVar('y')]);

test('validate equality', () => {
  const res = validateOperator(eqExpr, ['Term', 'Term']);
  assert.equal(res.semantics.lower, 'eq_term');
});

// Numeric GT with placeholder coercion
const gtExpr = fac.createOperatorExpression(SparqlOperator.GT, [dummyVar('n1'), dummyVar('n2')]);

test('validate greater than', () => {
  const res = validateOperator(gtExpr, ['Term', 'Term']);
  assert.ok(res.coercions.length === 1 && res.coercions[0].kind === 'NumericCanonical');
});

console.log('operator tests completed');
