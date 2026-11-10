const {pointFromScalar} = require('tiny-secp256k1');
const {privateAdd} = require('tiny-secp256k1');
const {privateNegate} = require('tiny-secp256k1');

const taggedHash = require('./tagged_hash');

const evenKeyPrefix = 2;
const tapTweakTag = Buffer.from('TapTweak');

/** Tweak a private key for a taproot key spend with a script root

  {
    private_key: <Private Key Buffer Object>
    root: <Script Root Buffer Object>
  }

  @returns
  {
    private_key: <Tweaked Private Key Buffer Object>
  }
*/
module.exports = args => {
  const publicKey = Buffer.from(pointFromScalar(args.private_key, true));

  const isEven = publicKey[0] === evenKeyPrefix;

  const {hash} = taggedHash({
    message: Buffer.concat([publicKey.subarray(1), args.root]),
    tag: tapTweakTag,
  });

  // A key with an odd public key is negated
  const key = isEven ? args.private_key : privateNegate(args.private_key);

  return {private_key: Buffer.from(privateAdd(key, hash))};
};
