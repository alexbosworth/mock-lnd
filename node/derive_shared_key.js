const {createHash} = require('node:crypto');

const {isPoint} = require('tiny-secp256k1');
const {pointMultiply} = require('tiny-secp256k1');

const sha256 = n => createHash('sha256').update(n).digest();

/** Derive a shared key, as LND derives it: the hash of the compressed point

  {
    ephemeral_pubkey: <Other Public Key Buffer Object>
    private_key: <Private Key Buffer Object>
  }

  @throws
  <Error>

  @returns
  {
    shared_key: <Shared Key Buffer Object>
  }
*/
module.exports = args => {
  if (!args.ephemeral_pubkey || !isPoint(args.ephemeral_pubkey)) {
    throw new Error('ExpectedEphemeralPublicKeyToDeriveSharedKey');
  }

  const point = pointMultiply(args.ephemeral_pubkey, args.private_key, true);

  return {shared_key: sha256(point)};
};
