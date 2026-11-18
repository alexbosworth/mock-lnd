const {isPoint} = require('tiny-secp256k1');

const bufferAsBigInt = buffer => BigInt(`0x${buffer.toString('hex')}`);
const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const compressedKeyByteLength = 33;
const fieldPrime = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2Fn;
const prefixes = [2, 3];

/** Find the problem with a compressed public key, as LND parses public keys

  {
    key: <Public Key Buffer Object>
  }

  @returns
  {
    [problem]: <Public Key Problem String>
  }
*/
module.exports = ({key}) => {
  // Exit early when the key is not the size of a compressed key
  if (key.length !== compressedKeyByteLength) {
    return {problem: `malformed public key: invalid length: ${key.length}`};
  }

  const [prefix] = key;

  // Exit early when the key does not have the prefix of a compressed key
  if (!prefixes.includes(prefix)) {
    const format = prefix.toString(16);

    return {problem: `invalid public key: unsupported format: ${format}`};
  }

  const x = key.subarray(1);

  // Exit early when the x coordinate is not in the field
  if (bufferAsBigInt(x) >= fieldPrime) {
    return {problem: 'invalid public key: x >= field prime'};
  }

  // Exit early when the key is a point on the curve
  if (isPoint(key)) {
    return {};
  }

  return {
    problem: `invalid public key: x coordinate ${bufferAsHex(x)} is not ` +
      'on the secp256k1 curve',
  };
};
