const {isPoint} = require('tiny-secp256k1');
const {pointAdd} = require('tiny-secp256k1');

const nonceByteLength = 66;
const pointByteLength = 33;

/** Aggregate the public nonces of MuSig2 signers, as BIP-327 NonceAgg does

  {
    nonces: [<Public Nonce Buffer Object>]
  }

  @throws
  <Error>

  @returns
  {
    nonce: <Aggregated Public Nonce Buffer Object>
  }
*/
module.exports = ({nonces}) => {
  if (!nonces.every(n => n.length === nonceByteLength)) {
    throw new Error('invalid public nonce length');
  }

  // A public nonce is a first point and then a second point
  const points = nonces.map(nonce => {
    const first = nonce.subarray(0, pointByteLength);

    return [first, nonce.subarray(pointByteLength)];
  });

  if (!points.flat().every(n => isPoint(n))) {
    throw new Error('invalid public nonce point');
  }

  // The first points are added together, and the second points are too
  const sums = [0, 1].map(index => {
    return points.reduce((sum, nonce) => {
      return !sum ? nonce[index] : pointAdd(sum, nonce[index], true);
    },
    null);
  });

  // A sum at the point at infinity is encoded as zeros
  const encoded = sums.map(sum => {
    return !sum ? Buffer.alloc(pointByteLength) : Buffer.from(sum);
  });

  return {nonce: Buffer.concat(encoded)};
};
