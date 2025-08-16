import assert from 'assert';
import sparqlPkg from 'sparqlalgebrajs';
const { translate } = sparqlPkg;
import { buildProgramIR } from '../../dist/ir/build.js';

const query = `SELECT ?s ?o WHERE { ?s <p> ?o . }`;
const algebra = translate(query);
const ir = buildProgramIR(algebra, { queryText: query });

assert.equal(ir.patterns.length, 1, 'one pattern');
assert.ok(ir.exprs['var:s'], 'var s expr');
assert.ok(ir.exprs['var:o'], 'var o expr');
console.log('IR basic test OK');
