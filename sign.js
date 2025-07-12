// A script to prepare an RDF Dataset for a Merkle tree proof
import dereferenceToStore from "rdf-dereference-store";
import { RDFC10 } from "rdfjs-c14n";
import N3 from "n3";
import fs from "fs";
import { termToString } from "rdf-string-ttl";
import { execSync } from 'child_process';
import crypto from 'crypto';
import secp256k1 from 'secp256k1';
import { loadCompressedPublicKey } from './keygen.js';

// Dereference, parse and canonicalize the RDF dataset
const { store } = await dereferenceToStore.default('./data.ttl', { localFiles: true });
const quads = (new N3.Parser()).parse(await new RDFC10().canonicalize(store));

// Create the encoder file
const mainTemplate = fs.readFileSync('./template/main.template.nr', 'utf8');
const fieldTemplate = fs.readFileSync('./template/field.template.nr', 'utf8');

const triples = quads.map(quad => {
    return fieldTemplate
      .replace('{{subject}}', termToString(quad.subject).replaceAll('"', '\\"'))
      .replace('{{predicate}}', termToString(quad.predicate).replaceAll('"', '\\"'))
      .replace('{{object}}', termToString(quad.object).replaceAll('"', '\\"'));
});

fs.mkdirSync('./noir_encode/src/', { recursive: true });
fs.writeFileSync('./noir_encode/src/main.nr', 
  mainTemplate
    .replaceAll('{{triples}}', triples.join(',\n'))
    .replaceAll('{{triples_len}}', quads.length),
);

const res = execSync('cd noir_encode && nargo execute', { stdio: 'pipe' }).toString();
fs.rmSync('./noir_encode/src', { force: true, recursive: true });
const resObj = res.slice(res.indexOf('{'), res.lastIndexOf('}') + 1);

// Add quotes around anything that looks like a hex encoding and then parse to json
const jsonRes = JSON.parse(resObj.replace(/0x[0-9a-fA-F]+/g, match => `"${match}"`));

// generate privKey
let privKey
do {
  privKey = crypto.randomBytes(32)
} while (!secp256k1.privateKeyVerify(privKey))

// get the public key in a compressed format
const pubKey = secp256k1.publicKeyCreate(privKey)

// sign the message 
const sigObj = secp256k1.ecdsaSign(Buffer.from(jsonRes.root_u8), privKey)

const pairs = loadCompressedPublicKey(pubKey[0], pubKey.subarray(1, 33));

jsonRes.pubKey = Buffer.from(pubKey).toString('hex');
jsonRes.x = pairs.getPublic().getX().toArray()
jsonRes.y = pairs.getPublic().getY().toArray()
jsonRes.signaure = Array.from(sigObj.signature);

fs.writeFileSync('./temp/main.json', JSON.stringify(jsonRes, null, 2));
