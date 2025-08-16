import assert from 'assert';
import sparqlPkg from 'sparqlalgebrajs';
const { translate } = sparqlPkg;
import { buildProgram } from '../../dist/pipeline/buildProgram.js';

const query = `BASE <http://example.org/> SELECT ?s WHERE { ?s <http://example.org/p> ?o . FILTER(?s = ?s) }`;
const algebra = translate(query);
const program = buildProgram(algebra);
assert.equal(program.patterns.length, 1);
assert.ok(program.exprs['var:s']);
console.log('Pipeline program build OK');
