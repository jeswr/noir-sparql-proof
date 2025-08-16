import fs from 'fs';
import path from 'path';
import sparqlPkg from 'sparqlalgebrajs';
import { buildProgram } from '../dist/pipeline/buildProgram.js';
import { emitNoir } from '../dist/backend/noir/emit.js';

const { translate } = sparqlPkg;

async function main() {
  const query = process.argv[2] || 'SELECT ?s WHERE { ?s <http://example.org/p> ?o . }';
  const algebra = translate(query);
  const program = buildProgram(algebra);
  const out = emitNoir(program, { outDir: 'generated_noir', filename: 'main.nr' });
  console.log('Generated Noir at', out);
}
main().catch(e => { console.error(e); process.exit(1); });
