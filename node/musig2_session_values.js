const {pointAdd} = require('tiny-secp256k1');
const {pointMultiply} = require('tiny-secp256k1');

const curveOrder = require('./curve_order');
const taggedHash = require('./tagged_hash');

const bufferAsBigInt = buffer => BigInt(`0x${buffer.toString('hex')}`);
const challengeTag = Buffer.from('BIP0340/challenge');
const generator = Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex');
const isInfinity = point => !point.some(byte => !!byte);
const nonceCoefficientTag = Buffer.from('MuSig/noncecoef');
const pointByteLength = 33;
const scalarBytes = n => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');
const xOnly = point => point.subarray(1);

/** Get the values of a MuSig2 signing session for a message, as BIP-327
  GetSessionValues gets them

  {
    key: <Aggregated Key With Tweaks Compressed Buffer Object>
    message: <Message Digest Buffer Object>
    nonce: <Aggregated Public Nonce Buffer Object>
  }

  @returns
  {
    challenge: <Signature Challenge BigInt>
    nonce: <Final Nonce Compressed Point Buffer Object>
    nonce_coefficient: <Nonce Coefficient BigInt>
  }
*/
module.exports = args => {
  const {hash} = taggedHash({
    message: Buffer.concat([args.nonce, xOnly(args.key), args.message]),
    tag: nonceCoefficientTag,
  });

  const coefficient = bufferAsBigInt(hash) % curveOrder;
  const first = args.nonce.subarray(0, pointByteLength);
  const second = args.nonce.subarray(pointByteLength);

  // The second nonce point is multiplied by the nonce coefficient
  const scaled = (() => {
    // Exit early when there is nothing to scale
    if (isInfinity(second) || !coefficient) {
      return null;
    }

    return pointMultiply(second, scalarBytes(coefficient), true);
  })();

  // The final nonce is the first point plus the scaled second point
  const sum = (() => {
    // Exit early when the first point is the point at infinity
    if (isInfinity(first)) {
      return scaled;
    }

    return !scaled ? first : pointAdd(first, scaled, true);
  })();

  // A final nonce at infinity is the generator point instead
  const nonce = !sum ? generator : Buffer.from(sum);

  const challenge = taggedHash({
    message: Buffer.concat([xOnly(nonce), xOnly(args.key), args.message]),
    tag: challengeTag,
  });

  return {
    nonce,
    challenge: bufferAsBigInt(challenge.hash) % curveOrder,
    nonce_coefficient: coefficient,
  };
};
