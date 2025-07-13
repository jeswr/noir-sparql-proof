import fs from 'fs';
import { execSync } from 'child_process';
import { loadCompressedPublicKey } from './keygen.js';
import { getTermEncodingsStrings } from './dist/encode.js';
import { DataFactory as DF } from 'n3';
import json from './temp/main.json' with { type: 'json' };
import metadata from './noir_prove/metadata.json' with { type: 'json' };

// Load pubKey buffer from hex string
const pubKey = Buffer.from(json.pubKey, 'hex');
const pairs = loadCompressedPublicKey(pubKey[0], pubKey.subarray(1, 33));

const getTriple = (id) => `{ terms = [${json.triples[id].map(x => `"${x}"`).join(', ')}], path = [${json.paths[id].map(x => `"${x}"`).join(', ')}], directions = [${json.direction[id].map(x => `"${x}"`).join(', ')}] }`
const [alice, bob] = getTermEncodingsStrings([DF.namedNode('http://example.org/Alice'), DF.namedNode('http://example.org/Bob')]);

const inputs = [4, 5, 11];

fs.writeFileSync('./noir_prove/Prover.toml', `
public_key_x = [${pairs.getPublic().getX().toArray().join(', ')}]
public_key_y = [${pairs.getPublic().getY().toArray().join(', ')}]
signature = [${Buffer.from(json.signaure, 'hex').join(', ')}]
root = "${json.root}"
bgp = [${getTriple(4)}, ${getTriple(5)}, ${getTriple(11)}]
variables = { friend = "${bob}", person = "${alice}" }
hidden = [${metadata.hiddenInputs.map(elem => `"${json.tripleFields[inputs[elem.value[0]]][elem.value[1]]}"`).join(', ')}]
`);

console.log(execSync('cd noir_prove && nargo execute', { stdio: 'pipe' }).toString());
