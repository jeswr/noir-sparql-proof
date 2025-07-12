import fs from 'fs';
import { execSync } from 'child_process';
import { loadCompressedPublicKey } from './keygen.js';
import json from './temp/main.json' with { type: 'json' };

// Load pubKey buffer from hex string
const pubKey = Buffer.from(json.pubKey, 'hex');
const pairs = loadCompressedPublicKey(pubKey[0], pubKey.subarray(1, 33));

fs.writeFileSync('./noir_prove/Prover.toml', `
public_key_x = [${pairs.getPublic().getX().toArray().join(', ')}]
public_key_y = [${pairs.getPublic().getY().toArray().join(', ')}]
signature = [${Buffer.from(json.signaure, 'hex').join(', ')}]
root = "${json.root}"
triple = { terms = [${json.triples[0].map(x => `"${x}"`).join(', ')}], path = [${json.paths[0].map(x => `"${x}"`).join(', ')}], directions = [${json.direction[0].map(x => `"${x}"`).join(', ')}] }
`);

console.log(execSync('cd noir_prove && nargo execute', { stdio: 'pipe' }).toString());
