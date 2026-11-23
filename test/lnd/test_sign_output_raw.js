const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {pointAddScalar} = require('tiny-secp256k1');
const {pointFromScalar} = require('tiny-secp256k1');
const {signTransaction} = require('lightning');
const {transactionFromComponents} = require('@alexbosworth/blockchain');
const {tweakHash} = require('p2tr');
const {v0HashToSign} = require('@alexbosworth/blockchain');
const {v1HashToSign} = require('p2tr');
const {verify} = require('tiny-secp256k1');
const {verifySchnorr} = require('tiny-secp256k1');

const {makeLnd} = require('./../../');
const witnessV0Hash = require('./../../node/v0_hash_to_sign');

const all = promises => Promise.all(promises);
const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const keyOf = n => Buffer.from(pointFromScalar(Buffer.alloc(32, n), true));
const p2wpkhScript = '0014751e76e8199196d454941c45d1b3a323f1433bd6';
const tokens = 5000;

// A transaction that spends an output to sign for
const transaction = transactionFromComponents({
  inputs: [{id: '11'.repeat(32), script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: p2wpkhScript, tokens: 4000}],
  version: 2,
}).transaction;

// A script that the key of the second secret can spend with a signature
const leafScript = `20${bufferAsHex(keyOf(2).subarray(1))}ac`;

// A witness script that the key of the second secret can spend
const witnessScript = `21${bufferAsHex(keyOf(2))}ac`;

// The key locator of the key of the second secret
const keys = [{family: 1, index: 2, secret: '02'.repeat(32)}];

// Decode a DER signature into a compact signature
const compactSignature = der => {
  const rLength = der[3];

  const r = der.subarray(4, 4 + rLength);
  const s = der.subarray(6 + rLength);

  // DER integers can have a leading zero, and can be shorter than 32 bytes
  const scalars = [r, s].map(n => {
    const hex = bufferAsHex(n).padStart(64, '0');

    return hexAsBuffer(hex.slice(-64));
  });

  return Buffer.concat(scalars);
};

// Sign a v0 input with the key of the second secret, and check the signature
const v0Signature = async args => {
  const lnd = makeLnd({keys, is_strict: true});

  const {signatures} = await signTransaction({
    lnd,
    transaction,
    inputs: [{
      key_family: 1,
      key_index: 2,
      output_script: args.output_script,
      output_tokens: tokens,
      sighash: args.sighash,
      vin: 0,
      witness_script: args.witness_script,
    }],
  });

  // Any sighash type is committed to, as LND commits to it
  const {hash} = witnessV0Hash({
    transaction,
    tokens,
    script: args.script_code,
    sighash: args.sighash,
    vin: 0,
  });

  const signature = compactSignature(hexAsBuffer(signatures[0]));

  return verify(hash, keyOf(2), signature);
};

// Sign a taproot input with the second secret, and check the signature
const v1Signature = async args => {
  const lnd = makeLnd({keys, is_strict: true});

  const isScriptSpend = !!args.witness_script;

  const tweak = tweakHash({
    hash: args.root_hash,
    public_key: bufferAsHex(keyOf(2).subarray(1)),
  });

  const outputKey = pointAddScalar(keyOf(2), hexAsBuffer(tweak.hash), true);

  const signingKey = isScriptSpend ? keyOf(2) : Buffer.from(outputKey);

  const script = `5120${bufferAsHex(signingKey.subarray(1))}`;

  const {signatures} = await signTransaction({
    lnd,
    transaction,
    inputs: [{
      key_family: 1,
      key_index: 2,
      output_script: script,
      output_tokens: tokens,
      root_hash: args.root_hash,
      sighash: 0,
      vin: 0,
      witness_script: args.witness_script,
    }],
  });

  const leaf = isScriptSpend ? {script: args.witness_script} : undefined;

  const {hash} = v1HashToSign({
    leaf,
    transaction,
    sighash: 0,
    spends: [{script, tokens}],
    vin: 0,
  });

  const message = hexAsBuffer(hash);
  const signature = hexAsBuffer(signatures[0]);

  return verifySchnorr(message, signingKey.subarray(1), signature);
};

// Sign for a spent value and for its tokens, and check that the signatures
// are the same, as gRPC makes the value into the tokens
const valueSignatures = async args => {
  const lnd = makeLnd({keys, is_strict: true});

  const signatures = await all([args.value, tokens].map(value => {
    const output = {value, pk_script: hexAsBuffer(args.script)};

    return new Promise((resolve, reject) => lnd.signer.signOutputRaw({
      prev_outputs: [output],
      raw_tx_bytes: hexAsBuffer(transaction),
      sign_descs: [{
        output,
        input_index: 0,
        key_desc: {key_loc: {key_family: 1, key_index: 2}},
        sighash: args.sighash,
        sign_method: args.sign_method,
        witness_script: args.witness_script,
      }],
    },
    (err, res) => !!err ? reject(err) : resolve(res.raw_sigs[0])));
  }));

  const [byValue, byTokens] = signatures.map(bufferAsHex);

  return byValue === byTokens;
};

// Sign with a key found by its public key or tweaked, and check it
const keySignature = async args => {
  const lnd = makeLnd({keys, is_strict: true});

  const tweak = Buffer.alloc(32, 3);

  const tweaked = Buffer.from(pointAddScalar(keyOf(2), tweak, true));

  const signingKey = !args.is_tweaked ? keyOf(2) : tweaked;

  const signed = await new Promise((resolve, reject) => {
    return lnd.signer.signOutputRaw({
      raw_tx_bytes: hexAsBuffer(transaction),
      sign_descs: [{
        input_index: 0,
        key_desc: args.key_desc,
        output: {pk_script: hexAsBuffer(p2wpkhScript), value: tokens},
        sighash: 1,
        single_tweak: args.is_tweaked ? tweak : undefined,
        witness_script: hexAsBuffer(witnessScript),
      }],
    },
    (err, res) => !!err ? reject(err) : resolve(res));
  });

  const {hash} = v0HashToSign({
    transaction,
    tokens,
    script: witnessScript,
    sighash: 1,
    vin: 0,
  });

  const signature = compactSignature(signed.raw_sigs[0]);

  return verify(hexAsBuffer(hash), signingKey, signature);
};

// Sign with a fake LND, and get the error details
const signError = ({descs, outputs, raw}) => new Promise(resolve => {
  const lnd = makeLnd({keys});

  const desc = {
    input_index: 0,
    key_desc: {key_loc: {key_family: 1, key_index: 2}},
    output: {pk_script: hexAsBuffer(p2wpkhScript), value: tokens},
    sighash: 1,
    witness_script: hexAsBuffer(p2wpkhScript),
  };

  return lnd.signer.signOutputRaw({
    prev_outputs: outputs,
    raw_tx_bytes: raw === undefined ? hexAsBuffer(transaction) : raw,
    sign_descs: !descs ? [desc] : descs.map(n => ({...desc, ...n})),
  },
  err => resolve(!err ? null : err.details));
});

// Sign with a key from deriveNextKey, by its locator and by its public key
const nextKeySignatures = async ({}) => {
  const lnd = makeLnd({});

  const derived = await new Promise(resolve => {
    return lnd.wallet.deriveNextKey({key_family: 7}, (err, res) => {
      return resolve(res);
    });
  });

  const keyDescs = [
    {key_loc: derived.key_loc},
    {raw_key_bytes: derived.raw_key_bytes},
  ];

  const signatures = await all(keyDescs.map(keyDesc => {
    return new Promise(resolve => lnd.signer.signOutputRaw({
      raw_tx_bytes: hexAsBuffer(transaction),
      sign_descs: [{
        input_index: 0,
        key_desc: keyDesc,
        output: {pk_script: hexAsBuffer(p2wpkhScript), value: tokens},
        sighash: 1,
        witness_script: hexAsBuffer(witnessScript),
      }],
    },
    (err, res) => resolve(bufferAsHex(res.raw_sigs[0]))));
  }));

  const [byLocator, byKey] = signatures;

  return byLocator === byKey;
};

// Sign with a callback that throws, and get the calls of the callback
const throwingSign = ({}) => {
  const calls = [];
  const lnd = makeLnd({keys});

  try {
    lnd.signer.signOutputRaw({
      raw_tx_bytes: hexAsBuffer(transaction),
      sign_descs: [{
        input_index: 0,
        key_desc: {key_loc: {key_family: 1, key_index: 2}},
        output: {pk_script: hexAsBuffer(p2wpkhScript), value: tokens},
        sighash: 1,
        witness_script: hexAsBuffer(witnessScript),
      }],
    },
    err => {
      calls.push(!!err ? err.details : null);

      throw new Error('CallbackFailed');
    });
  } catch (err) {
    return {calls, thrown: err.message};
  }

  return {calls};
};

// A compressed public key with an x coordinate that is not on the curve
const offCurveKey = Buffer.concat([Buffer.from([2]), Buffer.alloc(32)]);

// A compressed public key with an x coordinate past the field prime
const outOfFieldKey = Buffer.concat([Buffer.from([2]), Buffer.alloc(32, 255)]);

// An output script for a taproot key
const taprootScript = `5120${'22'.repeat(32)}`;

// A spent taproot output
const taprootOutput = {pk_script: hexAsBuffer(taprootScript), value: tokens};

const tests = [
  {
    args: {descs: [{key_desc: {raw_key_bytes: Buffer.alloc(33)}}]},
    description: 'A raw key has the prefix of a compressed public key',
    expected: 'invalid public key: unsupported format: 0',
    method: signError,
  },
  {
    args: {descs: [{key_desc: {raw_key_bytes: offCurveKey}}]},
    description: 'A raw key is a point on the curve',
    expected: `invalid public key: x coordinate ${'00'.repeat(32)} is not ` +
      'on the secp256k1 curve',
    method: signError,
  },
  {
    args: {descs: [{key_desc: {raw_key_bytes: outOfFieldKey}}]},
    description: 'A raw key has an x coordinate in the field',
    expected: 'invalid public key: x >= field prime',
    method: signError,
  },
  {
    args: {descs: [{input_index: 1}]},
    description: 'A signed input is an input of the transaction',
    expected: 'idx 1 but 1 txins',
    method: signError,
  },
  {
    args: {
      descs: [{
        input_index: 1,
        output: taprootOutput,
        sign_method: 1,
        witness_script: null,
      }],
      outputs: [taprootOutput],
    },
    description: 'A signed taproot input is an input of the transaction',
    expected: 'idx 1 but 1 txins',
    method: signError,
  },
  {
    args: {},
    description: 'A next key signs the same by its locator and public key',
    expected: true,
    method: nextKeySignatures,
  },
  {
    args: {},
    description: 'Signing outputs calls back once',
    expected: {calls: [null], thrown: 'CallbackFailed'},
    method: throwingSign,
  },
  {
    args: {
      output_script: `0020${'33'.repeat(32)}`,
      script_code: witnessScript,
      sighash: 1,
      witness_script: witnessScript,
    },
    description: 'A P2WSH input is signed with the witness script',
    expected: true,
    method: v0Signature,
  },
  {
    args: {
      output_script: p2wpkhScript,
      script_code: `76a914${p2wpkhScript.slice(4)}88ac`,
      sighash: 1,
      witness_script: p2wpkhScript,
    },
    description: 'A P2WPKH input is signed with the P2PKH script code',
    expected: true,
    method: v0Signature,
  },
  {
    args: {
      output_script: p2wpkhScript,
      script_code: `76a914${p2wpkhScript.slice(4)}88ac`,
      sighash: 0,
      witness_script: p2wpkhScript,
    },
    description: 'A v0 input is signed with a sighash type of zero like LND',
    expected: true,
    method: v0Signature,
  },
  {
    args: {
      script: p2wpkhScript,
      sighash: 1,
      value: tokens + 0.75,
      witness_script: hexAsBuffer(p2wpkhScript),
    },
    description: 'A v0 spend of a fractional value signs the whole tokens',
    expected: true,
    method: valueSignatures,
  },
  {
    args: {
      script: taprootScript,
      sighash: 0,
      sign_method: 1,
      value: tokens + 0.75,
    },
    description: 'A taproot spend of a fractional value signs whole tokens',
    expected: true,
    method: valueSignatures,
  },
  {
    args: {
      script: p2wpkhScript,
      sighash: 1,
      value: {high: 0, low: tokens},
      witness_script: hexAsBuffer(p2wpkhScript),
    },
    description: 'A v0 spend of a protobuf long value signs its tokens',
    expected: true,
    method: valueSignatures,
  },
  {
    args: {
      script: taprootScript,
      sighash: 0,
      sign_method: 1,
      value: {high: 0, low: tokens},
    },
    description: 'A taproot spend of a protobuf long value signs its tokens',
    expected: true,
    method: valueSignatures,
  },
  {
    args: {},
    description: 'A BIP-86 taproot input is signed with the tweaked key',
    expected: true,
    method: v1Signature,
  },
  {
    args: {root_hash: '44'.repeat(32)},
    description: 'A taproot key spend is signed with the root tweaked key',
    expected: true,
    method: v1Signature,
  },
  {
    args: {root_hash: '44'.repeat(32), witness_script: leafScript},
    description: 'A taproot script spend is signed with the key itself',
    expected: true,
    method: v1Signature,
  },
  {
    args: {key_desc: {raw_key_bytes: keyOf(2)}},
    description: 'A known key can be identified by its public key',
    expected: true,
    method: keySignature,
  },
  {
    args: {
      is_tweaked: true,
      key_desc: {key_loc: {key_family: 1, key_index: 2}},
    },
    description: 'A single tweak is added to the signing key',
    expected: true,
    method: keySignature,
  },
  {
    args: {descs: [{output: {pk_script: Buffer.alloc(1), value: '1-2'}}]},
    description: 'A value that gRPC cannot encode fails the request',
    expected: 'Request message serialization failure: interior hyphen',
    method: signError,
  },
  {
    args: {descs: [{output: {pk_script: Buffer.alloc(1), value: ''}}]},
    description: 'An empty value string fails the request',
    expected: 'Request message serialization failure: empty string',
    method: signError,
  },
  {
    args: {outputs: [{pk_script: Buffer.alloc(1), value: '1-2'}]},
    description: 'A spent value that gRPC cannot encode fails the request',
    expected: 'Request message serialization failure: interior hyphen',
    method: signError,
  },
  {
    args: {descs: [{output: {value: '1-2'}}], raw: Buffer.alloc(0)},
    description: 'A request is encoded before LND checks it',
    expected: 'Request message serialization failure: interior hyphen',
    method: signError,
  },
  {
    args: {raw: Buffer.alloc(0)},
    description: 'A transaction is expected',
    expected: 'a transaction to sign MUST be passed in',
    method: signError,
  },
  {
    args: {descs: []},
    description: 'Sign descriptors are expected',
    expected: 'at least one SignDescs MUST be passed in',
    method: signError,
  },
  {
    args: {raw: Buffer.alloc(3)},
    description: 'A transaction is expected to be a transaction',
    expected: 'unable to decode tx: unexpected EOF',
    method: signError,
  },
  {
    args: {outputs: [taprootOutput, taprootOutput]},
    description: 'Spent outputs are the outputs of the inputs',
    expected: 'provided previous outputs doesn\'t match number of ' +
      'transaction inputs',
    method: signError,
  },
  {
    args: {descs: [{key_desc: {raw_key_bytes: Buffer.alloc(32)}}]},
    description: 'A raw key is a compressed public key',
    expected: 'pubkey must be serialized in compressed format if specified',
    method: signError,
  },
  {
    args: {descs: [{sign_method: 4}]},
    description: 'A sign method is a known sign method',
    expected: 'unable to unmarshal sign method: unknown RPC sign method <4>',
    method: signError,
  },
  {
    args: {descs: [{sign_method: 'SIGN_METHOD_TAPROOT_KEY_SPEND_BIP0086'}]},
    description: 'A sign method is for the output script',
    expected: 'selected sign method taproot_key_spend_bip86 is not ' +
      `compatible with given pk script ${p2wpkhScript}`,
    method: signError,
  },
  {
    args: {descs: [{witness_script: undefined}]},
    description: 'A v0 input is signed with a witness script',
    expected: 'witness script MUST be specified for segwit v0 sign method',
    method: signError,
  },
  {
    args: {
      descs: [{
        output: taprootOutput,
        sign_method: 1,
        tap_tweak: Buffer.alloc(32),
      }],
      outputs: [taprootOutput],
    },
    description: 'A BIP-86 key spend has no tap tweak',
    expected: 'tap tweak must be empty for BIP0086 key spend',
    method: signError,
  },
  {
    args: {
      descs: [{output: taprootOutput, sign_method: 2}],
      outputs: [taprootOutput],
    },
    description: 'A key spend for a script root has a tap tweak',
    expected: 'tap tweak must be specified for key spend with root hash',
    method: signError,
  },
  {
    args: {
      descs: [{output: taprootOutput, sign_method: 3, witness_script: null}],
      outputs: [taprootOutput],
    },
    description: 'A script spend has a script',
    expected: 'witness script MUST be specified for taproot script spend ' +
      'method',
    method: signError,
  },
  {
    args: {descs: [{output: taprootOutput, sign_method: 1}]},
    description: 'A taproot spend has spent outputs',
    expected: 'error signing taproot output, transaction input 0 is missing ' +
      'its previous outpoint information',
    method: signError,
  },
  {
    args: {descs: [{double_tweak: Buffer.alloc(32, 1)}]},
    description: 'Double tweaks are not supported',
    expected: 'double tweaks are not supported by the mock LND',
    method: signError,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, async () => {
    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
