const {createHash} = require('node:crypto');
const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');
const {throws} = require('node:assert/strict');

const {pointFromScalar} = require('tiny-secp256k1');
const {recover} = require('tiny-secp256k1');
const {verify} = require('tiny-secp256k1');
const {verifySchnorr} = require('tiny-secp256k1');
const {xOnlyPointAddTweak} = require('tiny-secp256k1');

const signMessage = require('./../../node/sign_message');

const key = Buffer.alloc(32, 7);
const msg = Buffer.from('message');
const publicKeyOf = n => Buffer.from(pointFromScalar(n, true)).toString('hex');
const sha256 = n => createHash('sha256').update(n).digest();
const tapTweakTag = Buffer.from('TapTweak');

// Sign the message with Schnorr and get the digests that the signature signs
const schnorrDigests = args => {
  const publicKey = Buffer.from(pointFromScalar(key, true)).subarray(1);

  const {signature} = signMessage({
    msg,
    double_hash: args.double_hash,
    private_key: key,
    schnorr_sig: true,
  });

  return {
    is_double_hash: verifySchnorr(sha256(sha256(msg)), publicKey, signature),
    is_hash: verifySchnorr(sha256(msg), publicKey, signature),
  };
};

// Sign the message with Schnorr with the key tweaked by a taproot root, and
// check that the signature is a signature of the tweaked key
const isTweakedSignature = ({root}) => {
  const publicKey = Buffer.from(pointFromScalar(key, true)).subarray(1);
  const tag = sha256(tapTweakTag);

  const {signature} = signMessage({
    msg,
    private_key: key,
    schnorr_sig: true,
    schnorr_sig_tap_tweak: root,
  });

  const tweak = sha256(Buffer.concat([tag, tag, publicKey, root]));

  const tweaked = xOnlyPointAddTweak(publicKey, tweak).xOnlyPubkey;

  return verifySchnorr(sha256(msg), tweaked, signature);
};

// Sign the message with ECDSA, and check the DER encoded signature
const derSignature = ({}) => {
  const publicKey = Buffer.from(pointFromScalar(key, true));
  const {signature} = signMessage({msg, private_key: key});

  // Decode the DER signature into the two 32 byte values of the signature
  const rLength = signature[3];

  const r = signature.subarray(4, 4 + rLength);
  const s = signature.subarray(6 + rLength);

  const compact = Buffer.concat([r.subarray(-32), s.subarray(-32)]);

  return {
    is_sequence: signature[0] === 0x30,
    is_valid: verify(sha256(msg), publicKey, compact),
  };
};

// Sign the message with a compact ECDSA signature, and recover the key
const recoveredKey = ({}) => {
  const {signature} = signMessage({msg, compact_sig: true, private_key: key});

  const recovered = recover(
    sha256(msg),
    signature.subarray(1),
    signature[0] - 31,
    true
  );

  return Buffer.from(recovered).toString('hex');
};

const tests = [
  {
    args: {msg: Buffer.alloc(0), private_key: key},
    description: 'A message is expected',
    error: 'a message to sign MUST be passed in',
    method: signMessage,
  },
  {
    args: {msg, compact_sig: true, private_key: key, schnorr_sig: true},
    description: 'Schnorr signatures are not compact',
    error: 'compact format can not be used for Schnorr signatures',
    method: signMessage,
  },
  {
    args: {msg, private_key: key, tag: Buffer.from('tag')},
    description: 'A tag is for Schnorr signatures',
    error: 'tag can only be used when the Schnorr signature option is set',
    method: signMessage,
  },
  {
    args: {},
    description: 'A Schnorr signature signs the hash of the message',
    expected: {is_double_hash: false, is_hash: true},
    method: schnorrDigests,
  },
  {
    args: {double_hash: true},
    description: 'A Schnorr signature can sign the double hash of a message',
    expected: {is_double_hash: true, is_hash: false},
    method: schnorrDigests,
  },
  {
    args: {root: Buffer.alloc(32, 9)},
    description: 'A Schnorr signature can be with a taproot tweaked key',
    expected: true,
    method: isTweakedSignature,
  },
  {
    args: {},
    description: 'An ECDSA signature is DER encoded',
    expected: {is_sequence: true, is_valid: true},
    method: derSignature,
  },
  {
    args: {},
    description: 'A compact ECDSA signature recovers the public key',
    expected: publicKeyOf(key),
    method: recoveredKey,
  },
];

tests.forEach(({args, description, error, expected, method}) => {
  test(description, () => {
    if (!!error) {
      return throws(() => method(args), new Error(error), 'Got error');
    }

    deepStrictEqual(method(args), expected, 'Got expected result');
  });
});
