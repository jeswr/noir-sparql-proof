import fs from 'fs';
import { execSync } from 'child_process';
import { loadCompressedPublicKey } from './keygen.js';
import { getTermEncodingsStrings, getTermField } from './dist/encode.js';
import { DataFactory as DF, Store } from 'n3';
import { getBindings } from './dist/transform.js';
import json from './temp/main.json' with { type: 'json' };
import metadata from './noir_prove/metadata.json' with { type: 'json' };
import { stringQuadToQuad, termToString, stringToTerm } from 'rdf-string-ttl';
import { translate } from 'sparqlalgebrajs';

// Load pubKey buffer from hex string
const pubKey = Buffer.from(json.pubKey, 'hex');
const pairs = loadCompressedPublicKey(pubKey[0], pubKey.subarray(1, 33));

const quadArr = json.nquads.map(quad => stringQuadToQuad(quad));
const stringArr = quadArr.map(quad => termToString(quad));
const store = new Store(quadArr);

for await (const binding of getBindings(translate(fs.readFileSync('./inputs/sparql.rq').toString()), store, metadata.inputPatterns)) {
  const inputs = binding.bgp.map(t1 => stringArr.indexOf(termToString(t1)));

  const getTriple = (id) => `{ terms = [${json.triples[id].map(x => `"${x}"`).join(', ')}], path = [${json.paths[id].map(x => `"${x}"`).join(', ')}], directions = [${json.direction[id].map(x => `"${x}"`).join(', ')}] }`

  let variableString = '';
  for (const variable of binding.bindings.keys()) {
    variableString += `${variable.value} = "${getTermEncodingsStrings([binding.bindings.get(variable)])[0]}"`;
  }
  
  fs.writeFileSync('./noir_prove/Prover.toml', `
public_key_x = [${pairs.getPublic().getX().toArray().join(', ')}]
public_key_y = [${pairs.getPublic().getY().toArray().join(', ')}]
signature = [${Buffer.from(json.signaure, 'hex').join(', ')}]
root = "${json.root}"
bgp = [${inputs.map(i => getTriple(i)).join(', ')}]
variables = { ${variableString} }
hidden = [${metadata.hiddenInputs.map(elem => `"${elem.type === 'input'
      ? json.tripleFields[inputs[elem.value[0]]][elem.value[1]]
      : getTermField([DF.namedNode('http://example.org/Alice')])[0]
    }"`).join(', ')}]
`);

  const startTime = Date.now();
  console.time('PROVING')
  console.log(execSync('cd noir_prove && nargo execute', { stdio: 'pipe' }).toString());
  console.timeEnd('PROVING')
  const endTime = Date.now();
  const provingTimeMs = endTime - startTime;

  // Save timing information
  const timingData = {
    provingTimeMs: provingTimeMs,
    provingTimeFormatted: `${(provingTimeMs / 1000).toFixed(2)}s`,
    timestamp: new Date().toISOString()
  };

  fs.writeFileSync('./temp/timing.json', JSON.stringify(timingData, null, 2));

  // Update README with latest timing
  execSync('node update-readme-timing.js', { stdio: 'inherit' });
}