const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {beginGroupSigningSession} = require('lightning');
const {endGroupSigningSession} = require('lightning');
const {pointFromScalar} = require('tiny-secp256k1');
const {updateGroupSigningSession} = require('lightning');
const {verifySchnorr} = require('tiny-secp256k1');

const {makeLnd} = require('./../../');

const all = promises => Promise.all(promises);
const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const hash = Buffer.alloc(32, 9).toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const identity = {key_family: 6, key_index: 0};
const keyOf = n => Buffer.from(pointFromScalar(Buffer.alloc(32, n), true));
const resolved = value => Promise.resolve(value);
const rootHash = Buffer.alloc(32, 7).toString('hex');
const secretOf = n => Buffer.alloc(32, n).toString('hex');
const strict = n => makeLnd({is_strict: true, secret: n});
const version = 'MUSIG2_VERSION_V100RC2';

// Make a session request for the keys of the first and second secrets
const sessionRequest = args => ({
  all_signer_pubkeys: [keyOf(1), keyOf(2)],
  key_loc: identity,
  version,
  ...args,
});

// Call a method of a fake LND and get the response, or the error details
const call = ({lnd, method, request}) => new Promise(resolve => {
  return lnd.signer[method](request, (err, res) => {
    return resolve(!!err ? {details: err.details} : res);
  });
});

// Get the error of a call to a method of a default fake LND
const errorOf = async ({method, request}) => {
  const lnd = makeLnd({});

  return (await call({lnd, method, request})).details;
};

// Start a session with a cosigner, make calls, and get the last result
const afterSession = async ({calls, request}) => {
  const lnd = makeLnd({});
  const other = makeLnd({secret: secretOf(2)});

  const session = await call({
    lnd,
    method: 'muSig2CreateSession',
    request: sessionRequest(request || {}),
  });

  const cosigner = await call({
    lnd: other,
    method: 'muSig2CreateSession',
    request: sessionRequest(request || {}),
  });

  // The cosigner gets the nonce of the session and signs the message
  await call({
    lnd: other,
    method: 'muSig2RegisterNonces',
    request: {
      other_signer_public_nonces: [session.local_public_nonces],
      session_id: cosigner.session_id,
    },
  });

  const signed = await call({
    lnd: other,
    method: 'muSig2Sign',
    request: {
      message_digest: hexAsBuffer(hash),
      session_id: cosigner.session_id,
    },
  });

  const context = {cosigner, session, signed};

  // The calls are made one after another, and the last result is returned
  return await calls.reduce(async (previous, step) => {
    await previous;

    const request = step.request(context);

    return await call({lnd, request, method: step.method});
  },
  resolved());
};

// Register the nonce of the cosigner with a session
const registerNonce = {
  method: 'muSig2RegisterNonces',
  request: ({cosigner, session}) => ({
    other_signer_public_nonces: [cosigner.local_public_nonces],
    session_id: session.session_id,
  }),
};

// Sign the message with a session
const sign = cleanup => ({
  method: 'muSig2Sign',
  request: ({session}) => ({
    cleanup,
    message_digest: hexAsBuffer(hash),
    session_id: session.session_id,
  }),
});

// Combine a signature of the cosigner with the signature of a session
const combine = signature => ({
  method: 'muSig2CombineSig',
  request: ({session, signed}) => ({
    other_partial_signatures: [signature || signed.local_partial_signature],
    session_id: session.session_id,
  }),
});

// Sign with two strict fake LNDs, and check the group signature
const groupSignature = async args => {
  const [lnd, other] = [1, 2].map(n => strict(secretOf(n)));

  const signers = [{lnd, cosigner: 2}, {cosigner: 1, lnd: other}];

  const [session, cosigner] = await all(signers.map(signer => {
    return beginGroupSigningSession({
      is_key_spend: args.is_key_spend,
      key_family: 6,
      key_index: 0,
      lnd: signer.lnd,
      public_keys: [bufferAsHex(keyOf(signer.cosigner))],
      root_hash: args.root_hash,
    });
  }));

  const partial = await updateGroupSigningSession({
    hash,
    id: cosigner.id,
    lnd: other,
    nonces: [session.nonce],
  });

  await updateGroupSigningSession({
    hash,
    id: session.id,
    lnd,
    nonces: [cosigner.nonce],
  });

  const {signature} = await endGroupSigningSession({
    lnd,
    id: session.id,
    signatures: [partial.signature],
  });

  const key = hexAsBuffer(session.external_key);

  return {
    has_internal_key: !!session.internal_key,
    is_same_key: session.external_key === cosigner.external_key,
    is_valid: verifySchnorr(hexAsBuffer(hash), key, hexAsBuffer(signature)),
  };
};

// Sign with two fake LNDs with a tweak, and check the group signature
const tweakedSignature = async args => {
  const tweaks = [{is_x_only: args.is_x_only, tweak: Buffer.alloc(32, 3)}];

  const signature = await afterSession({
    calls: [registerNonce, sign(), combine()],
    request: {tweaks},
  });

  const lnd = makeLnd({});

  const combined = await call({
    lnd,
    method: 'muSig2CombineKeys',
    request: {tweaks, version, all_signer_pubkeys: [keyOf(1), keyOf(2)]},
  });

  const message = hexAsBuffer(hash);
  const key = combined.combined_key;

  return verifySchnorr(message, key, signature.final_signature);
};

// Combine keys and start sessions, and check that they have the same keys
const combinedKeys = async args => {
  const lnd = makeLnd({});

  const combined = await call({
    lnd,
    method: 'muSig2CombineKeys',
    request: sessionRequest(args),
  });

  const session = await call({
    lnd,
    method: 'muSig2CreateSession',
    request: sessionRequest(args),
  });

  return {
    has_internal_key: !!combined.taproot_internal_key.length,
    has_session_internal_key: !!session.taproot_internal_key.length,
    is_same_key: combined.combined_key.equals(session.combined_key),
  };
};

// Start sessions with fake LNDs with the same keys, and compare nonces
const nonceReuse = async ({}) => {
  const [lnd, same] = [makeLnd({}), makeLnd({})];

  const request = sessionRequest({});

  const a = await call({lnd, request, method: 'muSig2CreateSession'});
  const b = await call({lnd, request, method: 'muSig2CreateSession'});
  const c = await call({request, lnd: same, method: 'muSig2CreateSession'});

  const [first, again, other] = [a, b, c].map(n => n.local_public_nonces);

  return {
    is_repeated_in_new_lnd: first.equals(other),
    is_repeated_in_session: first.equals(again),
  };
};

// Start a session with a pre-generated nonce, and check its public nonce
const pregeneratedNonce = async ({key}) => {
  const lnd = makeLnd({});

  const secret = Buffer.concat([Buffer.alloc(32, 4), Buffer.alloc(32, 5)]);

  const session = await call({
    lnd,
    method: 'muSig2CreateSession',
    request: sessionRequest({
      pregenerated_local_nonce: Buffer.concat([secret, keyOf(key)]),
    }),
  });

  const expected = Buffer.concat([keyOf(4), keyOf(5)]);

  return session.local_public_nonces.equals(expected);
};

// Start a session, register a nonce, start it again, and register again
const repeatedSession = async ({}) => {
  const lnd = makeLnd({});
  const other = makeLnd({secret: secretOf(2)});

  const request = sessionRequest({
    pregenerated_local_nonce: Buffer.concat([Buffer.alloc(64, 4), keyOf(1)]),
  });

  const cosigner = await call({
    lnd: other,
    method: 'muSig2CreateSession',
    request: sessionRequest({}),
  });

  const session = await call({lnd, request, method: 'muSig2CreateSession'});

  const first = await call({
    lnd,
    method: registerNonce.method,
    request: registerNonce.request({cosigner, session}),
  });

  const again = await call({lnd, request, method: 'muSig2CreateSession'});

  const registered = await call({
    lnd,
    method: registerNonce.method,
    request: registerNonce.request({cosigner, session: again}),
  });

  return {
    have_all_nonces: again.have_all_nonces,
    is_first_registered: first.have_all_nonces,
    is_registered: registered.have_all_nonces,
    is_same_id: session.session_id.equals(again.session_id),
  };
};

// Register nonces with a callback that throws, and get the callback calls
const throwingRegister = async ({}) => {
  const calls = [];
  const lnd = makeLnd({});
  const other = makeLnd({secret: secretOf(2)});

  const [session, cosigner] = await all([lnd, other].map(n => call({
    lnd: n,
    method: 'muSig2CreateSession',
    request: sessionRequest({}),
  })));

  const request = registerNonce.request({cosigner, session});

  try {
    lnd.signer.muSig2RegisterNonces(request, err => {
      calls.push(!!err ? err.details : null);

      throw new Error('CallbackFailed');
    });
  } catch (err) {
    return {calls, thrown: err.message};
  }

  return {calls};
};

// Sign with cleanup, and get the start of the error of combining after
const cleanedUpError = async args => {
  const {details} = await afterSession(args);

  return details.slice(0, 44);
};

// Start a session, sign, combine, and get if there is a final signature
const hasFinalSignature = async args => {
  const res = await afterSession(args);

  return res.have_all_signatures && res.final_signature.length === 64;
};

const tests = [
  {
    args: {root_hash: rootHash},
    description: 'A group signs for a key that commits to a script root',
    expected: {has_internal_key: true, is_same_key: true, is_valid: true},
    method: groupSignature,
  },
  {
    args: {is_key_spend: true},
    description: 'A group signs for a BIP-86 taproot key',
    expected: {has_internal_key: true, is_same_key: true, is_valid: true},
    method: groupSignature,
  },
  {
    args: {},
    description: 'A group signs for a key that is not tweaked',
    expected: {has_internal_key: false, is_same_key: true, is_valid: true},
    method: groupSignature,
  },
  {
    args: {is_x_only: true},
    description: 'A group signs for a key with an x-only tweak',
    expected: true,
    method: tweakedSignature,
  },
  {
    args: {is_x_only: false},
    description: 'A group signs for a key with a plain tweak',
    expected: true,
    method: tweakedSignature,
  },
  {
    args: {taproot_tweak: {script_root: hexAsBuffer(rootHash)}},
    description: 'Combined keys are the keys of sessions',
    expected: {
      has_internal_key: true,
      has_session_internal_key: true,
      is_same_key: true,
    },
    method: combinedKeys,
  },
  {
    args: {},
    description: 'Combined keys always have the key before tweaks',
    expected: {
      has_internal_key: true,
      has_session_internal_key: false,
      is_same_key: true,
    },
    method: combinedKeys,
  },
  {
    args: {},
    description: 'Nonces are the same in each fake LND, not in each session',
    expected: {is_repeated_in_new_lnd: true, is_repeated_in_session: false},
    method: nonceReuse,
  },
  {
    args: {key: 1},
    description: 'A pre-generated nonce is the nonce of a session',
    expected: true,
    method: pregeneratedNonce,
  },
  {
    args: {
      method: 'muSig2CreateSession',
      request: sessionRequest({
        pregenerated_local_nonce: Buffer.concat([Buffer.alloc(64), keyOf(1)]),
      }),
    },
    description: 'A pre-generated nonce has valid scalars',
    expected: 'local nonce scalars must be valid private keys',
    method: errorOf,
  },
  {
    args: {},
    description: 'A session that is registered again starts over',
    expected: {
      have_all_nonces: false,
      is_first_registered: true,
      is_registered: true,
      is_same_id: true,
    },
    method: repeatedSession,
  },
  {
    args: {},
    description: 'Registering nonces calls back once',
    expected: {calls: [null], thrown: 'CallbackFailed'},
    method: throwingRegister,
  },
  {
    args: {
      calls: [registerNonce, sign()],
      request: {
        pregenerated_local_nonce: Buffer.concat([
          Buffer.alloc(64, 4),
          keyOf(3),
        ]),
      },
    },
    description: 'A pre-generated nonce is for the key of the session',
    expected: {
      details: 'error signing: error signing with local key: error signing ' +
        'with local key: public key does not match secnonce',
    },
    method: afterSession,
  },
  {
    args: {method: 'muSig2CreateSession', request: {key_loc: identity}},
    description: 'A MuSig2 version is expected',
    expected: 'error parsing version: unknown MuSig2 version ' +
      '<MUSIG2_VERSION_UNDEFINED>, make sure your client software is up to ' +
      'date, the version field is mandatory for this release of lnd',
    method: errorOf,
  },
  {
    args: {
      method: 'muSig2CombineKeys',
      request: sessionRequest({version: 'MUSIG2_VERSION_V040'}),
    },
    description: 'The draft MuSig2 version is not supported',
    expected: 'MuSig2 v0.4.0 is not supported by the mock LND',
    method: errorOf,
  },
  {
    args: {
      method: 'muSig2CreateSession',
      request: sessionRequest({key_loc: undefined}),
    },
    description: 'A key locator is expected',
    expected: 'missing key_loc',
    method: errorOf,
  },
  {
    args: {
      method: 'muSig2CreateSession',
      request: sessionRequest({all_signer_pubkeys: [keyOf(1)]}),
    },
    description: 'Two signing keys are expected',
    expected: 'error parsing all signer public keys: need at least two ' +
      'signing public keys',
    method: errorOf,
  },
  {
    args: {
      method: 'muSig2CreateSession',
      request: sessionRequest({
        all_signer_pubkeys: [keyOf(1).subarray(1), keyOf(2).subarray(1)],
      }),
    },
    description: 'Keys are compressed keys, as the lightning package expects',
    expected: 'error parsing all signer public keys: error parsing signer ' +
      'public key 0 for v1.0.0rc2 (compressed format): malformed public ' +
      'key: invalid length: 32',
    method: errorOf,
  },
  {
    args: {
      method: 'muSig2CreateSession',
      request: sessionRequest({all_signer_pubkeys: [keyOf(2), keyOf(3)]}),
    },
    description: 'The signing key is one of the keys',
    expected: 'error registering session: error creating signing context: ' +
      'error creating MuSig2 signing context: signing key is not found in ' +
      'key set',
    method: errorOf,
  },
  {
    args: {
      method: 'muSig2CreateSession',
      request: sessionRequest({
        other_signer_public_nonces: [Buffer.alloc(66), Buffer.alloc(66)],
      }),
    },
    description: 'There are nonces only for other signers',
    expected: 'too many other signer public nonces, got 2 but expected a ' +
      'maximum of 1',
    method: errorOf,
  },
  {
    args: {
      method: 'muSig2CreateSession',
      request: sessionRequest({taproot_tweak: {}}),
    },
    description: 'A taproot tweak has a script root or is a key spend',
    expected: 'error unmarshaling tweak options: script root cannot be ' +
      'empty for non-keyspend',
    method: errorOf,
  },
  {
    args: {
      method: 'muSig2Sign',
      request: {
        message_digest: hexAsBuffer(hash),
        session_id: Buffer.alloc(1),
      },
    },
    description: 'A session id is a hash',
    expected: 'error parsing session ID: invalid session ID size, got 1 but ' +
      'expected 32',
    method: errorOf,
  },
  {
    args: {
      method: 'muSig2Cleanup',
      request: {session_id: Buffer.alloc(32)},
    },
    description: 'A session is expected to end it',
    expected: 'error cleaning up session: session with ID ' +
      `${Buffer.alloc(32).toString('hex')} not found`,
    method: errorOf,
  },
  {
    args: {calls: [registerNonce, registerNonce]},
    description: 'Nonces are registered once',
    expected: {details: 'error registering nonces: already have all nonces'},
    method: afterSession,
  },
  {
    args: {calls: [sign()]},
    description: 'A session signs after it has all the nonces',
    expected: {details: 'error signing: only have 1 of 2 required nonces'},
    method: afterSession,
  },
  {
    args: {calls: [registerNonce, sign(), sign()]},
    description: 'A session signs once',
    expected: {
      details: 'error signing: error signing with local key: error signing ' +
        'with local key: nonce already used',
    },
    method: afterSession,
  },
  {
    args: {
      calls: [
        registerNonce,
        {
          method: 'muSig2Sign',
          request: ({session}) => ({
            message_digest: Buffer.alloc(31),
            session_id: session.session_id,
          }),
        },
      ],
    },
    description: 'A session signs a digest',
    expected: {
      details: 'invalid message digest size, got 31 but expected 32',
    },
    method: afterSession,
  },
  {
    args: {calls: [registerNonce, sign(true), combine()]},
    description: 'A session that is cleaned up after signing is ended',
    expected: 'error combining signatures: session with ID ',
    method: cleanedUpError,
  },
  {
    args: {calls: [registerNonce, sign(), combine(Buffer.alloc(32, 1))]},
    description: 'Signatures are expected to combine into a valid signature',
    expected: {
      details: 'error combining signatures: error combining partial ' +
        'signature: error combining partial signature: final signature is ' +
        'invalid',
    },
    method: afterSession,
  },
  {
    args: {calls: [registerNonce, sign(), combine(Buffer.alloc(31))]},
    description: 'Partial signatures are 32 bytes',
    expected: {
      details: 'error parsing partial signatures: invalid partial ' +
        'signature at index 0: invalid partial signature length, got 31 ' +
        'wanted 32',
    },
    method: afterSession,
  },
  {
    args: {calls: [registerNonce, sign(), combine(Buffer.alloc(32, 255))]},
    description: 'Partial signatures are scalars',
    expected: {
      details: 'error parsing partial signatures: invalid partial ' +
        'signature at index 0: error decoding partial signature: partial ' +
        'signature is invalid',
    },
    method: afterSession,
  },
  {
    args: {calls: [registerNonce, sign(), combine()]},
    description: 'Signatures are combined into a final signature',
    expected: true,
    method: hasFinalSignature,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, async () => {
    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
