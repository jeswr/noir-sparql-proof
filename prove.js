import fs from 'fs';
import { execSync } from 'child_process';

const json = JSON.parse(fs.readFileSync('./temp/main.json', 'utf8'));
fs.writeFileSync('./noir_prove/Prover.toml', `
public_key_x = [${json.x.join(', ')}]
public_key_y = [${json.y.join(', ')}]
signature = [${json.signaure.join(', ')}]
message_hash = [${json.root_u8.join(', ')}]
`);

console.log(execSync('cd noir_prove && nargo execute', { stdio: 'pipe' }).toString());
