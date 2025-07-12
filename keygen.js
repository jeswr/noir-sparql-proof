import pkg from 'elliptic';
const { ec: EC } = pkg;

// Copied from https://github.com/cryptocoinjs/secp256k1-node/blob/358c0395e0323a48ea8aad8911c650c15c7efe32/lib/elliptic.js#L10
export function loadCompressedPublicKey(first, xbuf) {
  const ec = new EC('secp256k1')
  const ecparams = ec.curve

  let x = new ecparams.n.constructor(xbuf)

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
