const curveOrder = require('./curve_order');
const musig2SessionValues = require('./musig2_session_values');

const bufferAsBigInt = buffer => BigInt(`0x${buffer.toString('hex')}`);
const evenPrefix = 2;
const scalarBytes = n => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');
const secretNonceByteLength = 32;

/** Make a MuSig2 partial signature, as BIP-327 Sign makes it

  {
    gacc: <Accumulated Parity Factor BigInt>
    key: <Aggregated Key With Tweaks Compressed Buffer Object>
    key_coefficient: <Key Aggregation Coefficient BigInt>
    message: <Message Digest Buffer Object>
    nonce: <Aggregated Public Nonce Buffer Object>
    private_key: <Private Key Buffer Object>
    secret_nonce: <Secret Nonce Scalars Buffer Object>
  }

  @throws
  <Error>

  @returns
  {
    signature: <Partial Signature Buffer Object>
  }
*/
module.exports = args => {
  const firstNonce = args.secret_nonce.subarray(0, secretNonceByteLength);
  const secondNonce = args.secret_nonce.subarray(secretNonceByteLength);

  const [first, second] = [firstNonce, secondNonce].map(bufferAsBigInt);

  if (!first || !second) {
    throw new Error('secret nonce is blank');
  }

  const values = musig2SessionValues({
    key: args.key,
    message: args.message,
    nonce: args.nonce,
  });

  // Secret nonces are negated when the final nonce has an odd y coordinate
  const isEvenNonce = values.nonce[0] === evenPrefix;

  const k1 = isEvenNonce ? first : curveOrder - first;
  const k2 = isEvenNonce ? second : curveOrder - second;

  // The private key is negated to match the parity of the aggregated key
  const parity = args.key[0] === evenPrefix ? 1n : curveOrder - 1n;

  const privateKey = bufferAsBigInt(args.private_key);

  const key = (((parity * args.gacc) % curveOrder) * privateKey) % curveOrder;

  const nonces = k1 + values.nonce_coefficient * k2;

  const signed = values.challenge * args.key_coefficient * key;

  return {signature: scalarBytes((nonces + signed) % curveOrder)};
};
