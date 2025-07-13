// A script to prepare an RDF Dataset for a Merkle tree proof
import { execSync } from 'child_process';
import crypto from 'crypto';
import fs from "fs";
import N3 from "n3";
import dereferenceToStore from "rdf-dereference-store";
import { RDFC10 } from "rdfjs-c14n";
import secp256k1 from 'secp256k1';
import { getTermEncodings, getTermField } from './dist/encode.js';

// Dereference, parse and canonicalize the RDF dataset
const { store } = await dereferenceToStore.default('./inputs/data.ttl', { localFiles: true });
const quads = (new N3.Parser()).parse(await new RDFC10().canonicalize(store));

// Create the encoder file
const mainTemplate = fs.readFileSync('./template/main.template.nr', 'utf8');

const triples = quads.map(quad => '[' + getTermEncodings([
  quad.subject,
  quad.predicate,
  quad.object,
  quad.graph,
]).join(',') + ']');

const tripleFields = quads.map(quad => getTermField([
  quad.subject,
  quad.predicate,
  quad.object,
  quad.graph,
]));

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
jsonRes.tripleFields = tripleFields;

// generate privKey
let privKey
do {
  privKey = crypto.randomBytes(32)
} while (!secp256k1.privateKeyVerify(privKey))

// get the public key in a compressed format
const pubKey = secp256k1.publicKeyCreate(privKey)

// sign the message 
const sigObj = secp256k1.ecdsaSign(Buffer.from(jsonRes.root_u8), privKey)
delete jsonRes.root_u8;

jsonRes.pubKey = Buffer.from(pubKey).toString('hex');
jsonRes.signaure = Buffer.from(sigObj.signature).toString('hex');

fs.writeFileSync('./temp/main.json', JSON.stringify(jsonRes, null, 2));
