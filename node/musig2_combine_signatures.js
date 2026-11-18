const curveOrder = require('./curve_order');
const musig2SessionValues = require('./musig2_session_values');

const bufferAsBigInt = buffer => BigInt(`0x${buffer.toString('hex')}`);
const evenPrefix = 2;
const scalarBytes = n => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');

/** Combine MuSig2 partial signatures into a signature, as BIP-327
  PartialSigAgg combines them

  {
    key: <Aggregated Key With Tweaks Compressed Buffer Object>
    message: <Message Digest Buffer Object>
    nonce: <Aggregated Public Nonce Buffer Object>
    signatures: [<Partial Signature Buffer Object>]
    tacc: <Accumulated Tweak BigInt>
  }

  @returns
  {
    signature: <Schnorr Signature Buffer Object>
  }
*/
module.exports = args => {
  const values = musig2SessionValues({
    key: args.key,
    message: args.message,
    nonce: args.nonce,
  });

  const sum = args.signatures.reduce((total, signature) => {
    return (total + bufferAsBigInt(signature)) % curveOrder;
  },
  0n);

  // The tweaks are added to the signature, as the challenge commits to them
  const parity = args.key[0] === evenPrefix ? 1n : curveOrder - 1n;

  const tweak = (values.challenge * parity * args.tacc) % curveOrder;

  const scalar = scalarBytes((sum + tweak) % curveOrder);

  return {signature: Buffer.concat([values.nonce.subarray(1), scalar])};
};
