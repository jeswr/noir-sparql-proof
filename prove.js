import fs from 'fs';
import { execSync } from 'child_process';
import { loadCompressedPublicKey } from './keygen.js';

const json = JSON.parse(fs.readFileSync('./temp/main.json', 'utf8'));

// Load pubKey buffer from hex string
const pubKey = Buffer.from(json.pubKey, 'hex');
const pairs = loadCompressedPublicKey(pubKey[0], pubKey.subarray(1, 33));

fs.writeFileSync('./noir_prove/Prover.toml', `
public_key_x = [${pairs.getPublic().getX().toArray().join(', ')}]
public_key_y = [${pairs.getPublic().getY().toArray().join(', ')}]
signature = [${Buffer.from(json.signaure, 'hex').join(', ')}]
root = "${json.root}"
`);

console.log(execSync('cd noir_prove && nargo execute', { stdio: 'pipe' }).toString());
