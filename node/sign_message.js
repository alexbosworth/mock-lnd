const {createHash} = require('node:crypto');

const {sign} = require('tiny-secp256k1');
const {signRecoverable} = require('tiny-secp256k1');
const {signSchnorr} = require('tiny-secp256k1');

const derSignature = require('./der_signature');
const taggedHash = require('./tagged_hash');
const tapTweaked = require('./tap_tweaked');

const compactHeader = 27 + 4;
const hasBytes = n => !!n && !!n.length;
const sha256 = n => createHash('sha256').update(n).digest();
const tagWithoutSchnorrError = 'tag can only be used when the Schnorr signature option is set';

/** Sign a message with a private key, as the LND signer signs

  Schnorr signatures sign the BIP-340 tagged hash when there is a tag. ECDSA
  signatures are DER encoded unless they are compact.

  {
    [compact_sig]: <Use Compact Signature Format Bool>
    [double_hash]: <Sign Double SHA256 Hash Bool>
    msg: <Message Buffer Object>
    private_key: <Private Key Buffer Object>
    [schnorr_sig]: <Use Schnorr Signature Bool>
    [schnorr_sig_tap_tweak]: <Taproot Script Root Buffer Object>
    [tag]: <BIP-340 Tag Buffer Object>
  }

  @throws
  <Error>

  @returns
  {
    signature: <Signature Buffer Object>
  }
*/
module.exports = args => {
  if (!args.msg || !args.msg.length) {
    throw new Error('a message to sign MUST be passed in');
  }

  if (!!args.schnorr_sig && !!args.compact_sig) {
    throw new Error('compact format can not be used for Schnorr signatures');
  }

  const hasTag = hasBytes(args.tag);

  if (hasTag && !args.schnorr_sig) {
    throw new Error(tagWithoutSchnorrError);
  }

  const digest = (() => {
    if (hasTag) {
      return taggedHash({message: args.msg, tag: args.tag}).hash;
    }

    return !args.double_hash ? sha256(args.msg) : sha256(sha256(args.msg));
  })();

  // Exit early when signing with Schnorr for a key that is not tweaked
  if (!!args.schnorr_sig && !hasBytes(args.schnorr_sig_tap_tweak)) {
    return {signature: Buffer.from(signSchnorr(digest, args.private_key))};
  }

  // Exit early when signing with Schnorr for a taproot tweaked key
  if (!!args.schnorr_sig) {
    const tweaked = tapTweaked({
      private_key: args.private_key,
      root: args.schnorr_sig_tap_tweak,
    });

    return {signature: Buffer.from(signSchnorr(digest, tweaked.private_key))};
  }

  // Exit early when signing with a compact recoverable signature
  if (!!args.compact_sig) {
    const {recoveryId, signature} = signRecoverable(digest, args.private_key);

    const header = Buffer.from([compactHeader + recoveryId]);

    return {signature: Buffer.concat([header, Buffer.from(signature)])};
  }

  const {encoded} = derSignature({signature: sign(digest, args.private_key)});

  return {signature: encoded};
};
