const {pointFromScalar} = require('tiny-secp256k1');

const curveOrder = require('./curve_order');
const taggedHash = require('./tagged_hash');

const bufferAsBigInt = buffer => BigInt(`0x${buffer.toString('hex')}`);
const nonceTag = Buffer.from('MuSig/nonce');
const scalarBytes = n => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');
const uint32 = n => Buffer.from(n.toString(16).padStart(8, '0'), 'hex');

/** Make the nonces of a MuSig2 signer for a signing session

  {
    count: <Count of Signing Sessions Number>
    key: <Aggregated Key With Tweaks Compressed Buffer Object>
    private_key: <Private Key Buffer Object>
  }

  @returns
  {
    public_nonce: <Public Nonce Buffer Object>
    secret_nonce: <Secret Nonce Buffer Object>
  }
*/
module.exports = args => {
  // Unlike LND's random nonces, these are the same every time a test runs
  const scalars = [1, 2].map(index => {
    const {hash} = taggedHash({
      message: Buffer.concat([
        args.private_key,
        args.key,
        uint32(args.count),
        uint32(index),
      ]),
      tag: nonceTag,
    });

    return scalarBytes(bufferAsBigInt(hash) % curveOrder);
  });

  const points = scalars.map(n => Buffer.from(pointFromScalar(n, true)));

  const publicKey = Buffer.from(pointFromScalar(args.private_key, true));

  return {
    public_nonce: Buffer.concat(points),
    // The secret nonce ends with the public key, as LND has it
    secret_nonce: Buffer.concat([...scalars, publicKey]),
  };
};
