// A script to prepare an RDF Dataset for a Merkle tree proof
import dereferenceToStore from "rdf-dereference-store";
import { RDFC10 } from "rdfjs-c14n";
import N3 from "n3";
import fs from "fs";
import { termToString } from "rdf-string-ttl";
import { execSync } from 'child_process';
import crypto from 'crypto';
import secp256k1 from 'secp256k1';

// Dereference, parse and canonicalize the RDF dataset
const { store } = await dereferenceToStore.default('./data.ttl', { localFiles: true });
const quads = (new N3.Parser()).parse(await new RDFC10().canonicalize(store));

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

// Add quotes around anything that looks like a hex encoding
const hexRegex = /0x[0-9a-fA-F]+/g;
const quotedRes = resObj.replace(hexRegex, match => `"${match}"`);

const jsonRes = JSON.parse(quotedRes);

// generate privKey
let privKey
do {
  privKey = crypto.randomBytes(32)
} while (!secp256k1.privateKeyVerify(privKey))

const msg = Buffer.from(jsonRes.root_u8);

// get the public key in a compressed format
const pubKey = secp256k1.publicKeyCreate(privKey)

// sign the message
const sigObj = secp256k1.ecdsaSign(msg, privKey)

jsonRes.pubKey = Buffer.from(pubKey).toString('hex');

// compressed public key from X and Y
function hashfn (x, y) {
  const pubKey = new Uint8Array(33)
  pubKey[0] = (y[31] & 1) === 0 ? 0x02 : 0x03
  pubKey.set(x, 1)
  return pubKey
}

// get X point of ecdh
const ecdhPointX = secp256k1.ecdh(pubKey, privKey, { hashfn }, Buffer.alloc(33))

jsonRes.x = Array.from(ecdhPointX)
// jsonRes.y = Array.from(pubKey.slice(1, 33))
jsonRes.y = Array.from(pubKey)

jsonRes.signaure = Array.from(sigObj.signature);

// console.log(jsonRes.pubKey = Buffer.from(pubKey).toString('hex'));
// console.log(ecdhPointX.toString('hex'))

// verify the signature
console.log(secp256k1.ecdsaVerify(sigObj.signature, msg, pubKey))
// => true

fs.writeFileSync('./temp/main.json', JSON.stringify(jsonRes, null, 2));
