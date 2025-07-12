// A script to prepare an RDF Dataset for a Merkle tree proof
import dereferenceToStore from "rdf-dereference-store";
import { RDFC10 } from "rdfjs-c14n";
import N3 from "n3";
import fs from "fs";
import { termToString } from "rdf-string-ttl";
import { execSync } from 'child_process';
import crypto from 'crypto';
import secp256k1 from 'secp256k1';
import pkg from 'elliptic';
const { ec: EC } = pkg;

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

// Add quotes around anything that looks like a hex encoding
const quotedRes = resObj.replace(/0x[0-9a-fA-F]+/g, match => `"${match}"`);

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


const ec = new EC('secp256k1')
const ecparams = ec.curve

// Hack, we can not use bn.js@5, while elliptic uses bn.js@4
// See https://github.com/indutny/elliptic/issues/191#issuecomment-569888758
const BN = ecparams.n.constructor

function loadCompressedPublicKey (first, xbuf) {
  let x = new BN(xbuf)

  // overflow
  if (x.cmp(ecparams.p) >= 0) return null
  x = x.toRed(ecparams.red)

  // compute corresponding Y
  let y = x.redSqr().redIMul(x).redIAdd(ecparams.b).redSqrt()
  if ((first === 0x03) !== y.isOdd()) y = y.redNeg()

  // x*x*x + b = y*y
  const x3 = x.redSqr().redIMul(x)
  if (!y.redSqr().redISub(x3.redIAdd(ecparams.b)).isZero()) return null

  return ec.keyPair({ pub: { x: x, y: y } })
}

const pairs = loadCompressedPublicKey(pubKey[0], pubKey.subarray(1, 33));

// console.log(pairs.getPublic().getX().toArray());

// process.exit();

jsonRes.pubKey = Buffer.from(pubKey).toString('hex');

// // compressed public key from X and Y
// function hashfn (x, y) {
//   const pubKey = new Uint8Array(33)
//   pubKey[0] = (y[31] & 1) === 0 ? 0x02 : 0x03
//   pubKey.set(x, 1)
//   return pubKey
// }

// // get X point of ecdh
// const ecdhPointX = secp256k1.ecdh(pubKey, privKey, { hashfn }, Buffer.alloc(33))

// console.log(ecdhPointX.length);

jsonRes.x = pairs.getPublic().getX().toArray()

// get Y point of ecdh
// const ecdhPointY = secp256k1.ecdh(pubKey, privKey, { hashfn }, Buffer.alloc(33, 0x01))
jsonRes.y = pairs.getPublic().getY().toArray()

jsonRes.signaure = Array.from(sigObj.signature);

fs.writeFileSync('./temp/main.json', JSON.stringify(jsonRes, null, 2));
