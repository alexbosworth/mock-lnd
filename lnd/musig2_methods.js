const {createHash} = require('node:crypto');

const {isPrivate} = require('tiny-secp256k1');
const {pointFromScalar} = require('tiny-secp256k1');
const {verifySchnorr} = require('tiny-secp256k1');

const curveOrder = require('./../node/curve_order');
const {deriveKey} = require('./../node');
const {makeRpcError} = require('./../data');
const {musig2AggregateKeys} = require('./../node');
const {musig2AggregateNonces} = require('./../node');
const {musig2CombineSignatures} = require('./../node');
const {musig2Nonces} = require('./../node');
const {musig2PartialSign} = require('./../node');
const {publicKeyProblem} = require('./../node');

const bufferAsBigInt = buffer => BigInt(`0x${buffer.toString('hex')}`);
const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const hashByteLength = 32;
const invalidLocalNonce = 'local nonce scalars must be valid private keys';
const isLocatorNumber = n => Number.isInteger(n) && n >= 0 && n < 2 ** 31;
const legacyVersions = ['MUSIG2_VERSION_V040', 1];
const nonceByteLength = 66;
const partialSignatureByteLength = 32;
const secretNonceByteLength = 97;
const sha256 = n => createHash('sha256').update(n).digest();
const unknownVersion = 'make sure your client software is up to date, the version field is mandatory for this release of lnd';
const unsupportedVersion = 'MuSig2 v0.4.0 is not supported by the mock LND';
const versionName = 'MUSIG2_VERSION_V100RC2';
const versions = ['MUSIG2_VERSION_V100RC2', 2];
const xOnly = point => Buffer.from(point.subarray(1));

/** Make the MuSig2 methods of the signer sub-server of a fake node

  {
    node: <Fake Node Object>
  }

  @returns
  {
    <Method Name String>: <RPC Method Function>
  }
*/
module.exports = ({node}) => {
  // The problem with a MuSig2 version, as LND parses versions
  const versionProblem = version => {
    // Exit early when the version is the BIP-327 version, LND's v1.0.0rc2
    if (versions.includes(version)) {
      return undefined;
    }

    // Exit early when the version is the draft version
    if (legacyVersions.includes(version)) {
      return unsupportedVersion;
    }

    const label = version || 'MUSIG2_VERSION_UNDEFINED';

    return `error parsing version: unknown MuSig2 version <${label}>, ` +
      unknownVersion;
  };

  // The problem with the public keys of the signers of a session
  const keysProblem = keys => {
    const prefix = 'error parsing all signer public keys';

    // Exit early when there are not enough signers
    if (!keys || keys.length < 2) {
      return `${prefix}: need at least two signing public keys`;
    }

    const problems = keys.map(key => {
      return publicKeyProblem({key: Buffer.from(key)}).problem;
    });

    const index = problems.findIndex(problem => !!problem);

    // Exit early when every key is a valid key
    if (index === -1) {
      return undefined;
    }

    const signer = `signer public key ${index} for v1.0.0rc2`;

    return `${prefix}: error parsing ${signer} (compressed format): ` +
      problems[index];
  };

  // The problem with public nonces, as LND parses nonces
  const noncesProblem = nonces => {
    const index = nonces.findIndex(n => n.length !== nonceByteLength);

    // Exit early when every nonce is the size of a nonce
    if (index === -1) {
      return undefined;
    }

    const size = nonces[index].length;

    return `invalid public nonce at index ${index}: invalid length, ` +
      `got ${size} but expected ${nonceByteLength}`;
  };

  // The problem with a session id, as LND parses session ids
  const sessionIdProblem = id => {
    const size = !id ? 0 : id.length;

    // Exit early when the session id is the size of a session id
    if (size === hashByteLength) {
      return undefined;
    }

    return 'error parsing session ID: invalid session ID size, ' +
      `got ${size} but expected ${hashByteLength}`;
  };

  // The tweaks of the aggregated key, as LND parses tweaks
  const tweaksOf = args => {
    const tweaks = (args.tweaks || []).map(desc => ({
      is_x_only: !!desc.is_x_only,
      tweak: Buffer.from(desc.tweak || []),
    }));

    const prefix = 'error unmarshaling tweak options';

    // Exit early when a generic tweak is empty
    if (tweaks.some(n => !n.tweak.length)) {
      return {problem: `${prefix}: tweak cannot be empty`};
    }

    const taproot = args.taproot_tweak || {};

    const root = Buffer.from(taproot.script_root || []);

    const isTaproot = !!args.taproot_tweak;

    const isMissingRoot = !taproot.key_spend_only && !root.length;

    // Exit early when a taproot tweak has no root and is not a key spend
    if (isTaproot && isMissingRoot) {
      return {
        problem: `${prefix}: script root cannot be empty for non-keyspend`,
      };
    }

    // Tweaks are 32 bytes, filled with zeros after the given bytes
    const generic = tweaks.map(n => ({
      is_x_only: n.is_x_only,
      tweak: Buffer.concat([n.tweak, Buffer.alloc(hashByteLength)])
        .subarray(0, hashByteLength),
    }));

    return {
      is_taproot: isTaproot,
      script_root: !taproot.key_spend_only ? root : Buffer.alloc(0),
      tweaks: generic,
    };
  };

  // A session of the node by its id
  const sessionOf = id => node.musig2.sessions[bufferAsHex(id)];

  // A session that has all of its nonces gets the aggregated nonce
  const withAllNonces = session => {
    // Exit early when there are nonces still to register
    if (session.nonces.length !== session.signers) {
      return session;
    }

    const {nonce} = musig2AggregateNonces({nonces: session.nonces});

    return {...session, nonce};
  };

  return {
    muSig2Cleanup: (args, cbk) => {
      const idProblem = sessionIdProblem(args.session_id);

      // Exit early when the session id is not a session id
      if (!!idProblem) {
        return cbk(makeRpcError({details: idProblem}));
      }

      const id = bufferAsHex(args.session_id);

      // Exit early when there is no such session
      if (!node.musig2.sessions[id]) {
        return cbk(makeRpcError({
          details: `error cleaning up session: session with ID ${id} ` +
            'not found',
        }));
      }

      delete node.musig2.sessions[id];

      return cbk(null, {});
    },
    muSig2CombineKeys: (args, cbk) => {
      const problem = versionProblem(args.version);

      // Exit early when the version is not the BIP-327 version
      if (!!problem) {
        return cbk(makeRpcError({details: problem}));
      }

      const keysError = keysProblem(args.all_signer_pubkeys);

      // Exit early when the public keys are not valid
      if (!!keysError) {
        return cbk(makeRpcError({details: keysError}));
      }

      const tweaks = tweaksOf(args);

      // Exit early when the tweaks are not valid
      if (!!tweaks.problem) {
        return cbk(makeRpcError({details: tweaks.problem}));
      }

      let aggregated;

      try {
        aggregated = musig2AggregateKeys({
          is_taproot: tweaks.is_taproot,
          keys: args.all_signer_pubkeys.map(n => Buffer.from(n)),
          script_root: tweaks.script_root,
          tweaks: tweaks.tweaks,
        });
      } catch (err) {
        return cbk(makeRpcError({
          details: `error combining keys: ${err.message}`,
        }));
      }

      return cbk(null, {
        combined_key: xOnly(aggregated.key),
        taproot_internal_key: xOnly(aggregated.internal_key),
        version: versionName,
      });
    },
    muSig2CombineSig: (args, cbk) => {
      const idProblem = sessionIdProblem(args.session_id);

      // Exit early when the session id is not a session id
      if (!!idProblem) {
        return cbk(makeRpcError({details: idProblem}));
      }

      const signatures = (args.other_partial_signatures || []).map(n => {
        return Buffer.from(n);
      });

      const prefix = 'error parsing partial signatures';

      // Exit early when there are no signatures to combine
      if (!signatures.length) {
        return cbk(makeRpcError({
          details: `${prefix}: at least one partial signature is required`,
        }));
      }

      const sizeIndex = signatures.findIndex(signature => {
        return signature.length !== partialSignatureByteLength;
      });

      // Exit early when a signature is not the size of a partial signature
      if (sizeIndex !== -1) {
        const size = signatures[sizeIndex].length;

        return cbk(makeRpcError({
          details: `${prefix}: invalid partial signature at index ` +
            `${sizeIndex}: invalid partial signature length, got ${size} ` +
            `wanted ${partialSignatureByteLength}`,
        }));
      }

      const rangeIndex = signatures.findIndex(signature => {
        return bufferAsBigInt(signature) >= curveOrder;
      });

      // Exit early when a signature is not a scalar
      if (rangeIndex !== -1) {
        return cbk(makeRpcError({
          details: `${prefix}: invalid partial signature at index ` +
            `${rangeIndex}: error decoding partial signature: partial ` +
            'signature is invalid',
        }));
      }

      const id = bufferAsHex(args.session_id);
      const session = sessionOf(args.session_id);

      // Exit early when there is no such session
      if (!session) {
        return cbk(makeRpcError({
          details: `error combining signatures: session with ID ${id} ` +
            'not found',
        }));
      }

      const combineError = 'error combining signatures: error combining ' +
        'partial signature: error combining partial signature';

      // Exit early when the session already has all of its signatures
      if (session.signatures.length === session.signers) {
        return cbk(makeRpcError({
          details: `${combineError}: already have all sigs`,
        }));
      }

      const remaining = session.signers - session.signatures.length;

      // Signatures past the signatures that are needed are not combined
      const combined = session.signatures.concat(
        signatures.slice(0, remaining)
      );

      node.musig2.sessions[id] = {...session, signatures: combined};

      // Exit early when there are more signatures than signers
      if (signatures.length > remaining) {
        return cbk(makeRpcError({
          details: `${combineError}: already have all sigs`,
        }));
      }

      // Exit early when there are signatures still to combine
      if (combined.length !== session.signers) {
        return cbk(null, {
          final_signature: Buffer.alloc(0),
          have_all_signatures: false,
        });
      }

      // Exit early when the session was not signed by the node
      if (!session.message) {
        return cbk(makeRpcError({
          details: `${combineError}: missing local partial signature`,
        }));
      }

      const {signature} = musig2CombineSignatures({
        key: session.key,
        message: session.message,
        nonce: session.nonce,
        signatures: combined,
        tacc: session.tacc,
      });

      // Exit early when the signature is not valid
      if (!verifySchnorr(session.message, xOnly(session.key), signature)) {
        return cbk(makeRpcError({
          details: `${combineError}: final signature is invalid`,
        }));
      }

      delete node.musig2.sessions[id];

      return cbk(null, {
        final_signature: signature,
        have_all_signatures: true,
      });
    },
    muSig2CreateSession: (args, cbk) => {
      const problem = versionProblem(args.version);

      // Exit early when the version is not the BIP-327 version
      if (!!problem) {
        return cbk(makeRpcError({details: problem}));
      }

      // Exit early when there is no key locator
      if (!args.key_loc) {
        return cbk(makeRpcError({details: 'missing key_loc'}));
      }

      const keysError = keysProblem(args.all_signer_pubkeys);

      // Exit early when the public keys are not valid
      if (!!keysError) {
        return cbk(makeRpcError({details: keysError}));
      }

      const keys = args.all_signer_pubkeys.map(n => Buffer.from(n));

      const nonces = (args.other_signer_public_nonces || []).map(n => {
        return Buffer.from(n);
      });

      // Exit early when there are more nonces than other signers
      if (nonces.length > keys.length - 1) {
        return cbk(makeRpcError({
          details: `too many other signer public nonces, got ` +
            `${nonces.length} but expected a maximum of ${keys.length - 1}`,
        }));
      }

      const pregenerated = Buffer.from(args.pregenerated_local_nonce || []);

      const hasNonce = !!pregenerated.length;

      // Exit early when a pre-generated nonce is not the size of a nonce
      if (hasNonce && pregenerated.length !== secretNonceByteLength) {
        return cbk(makeRpcError({
          details: `local nonces must be ${secretNonceByteLength} bytes, ` +
            `instead was ${pregenerated.length}`,
        }));
      }

      const nonceProblem = noncesProblem(nonces);

      // Exit early when a nonce is not the size of a nonce
      if (!!nonceProblem) {
        return cbk(makeRpcError({
          details: `error parsing other nonces: ${nonceProblem}`,
        }));
      }

      const tweaks = tweaksOf(args);

      // Exit early when the tweaks are not valid
      if (!!tweaks.problem) {
        return cbk(makeRpcError({details: tweaks.problem}));
      }

      const family = args.key_loc.key_family || Number();
      const index = args.key_loc.key_index || Number();

      // Exit early when the key locator is not a valid key locator
      if (!isLocatorNumber(family) || !isLocatorNumber(index)) {
        return cbk(makeRpcError({
          details: 'error registering session: error deriving private key: ' +
            'invalid key locator',
        }));
      }

      const signingKey = deriveKey({
        family,
        index,
        keys: node.keys,
        secret: node.secret,
      });

      const contextError = 'error registering session: error creating ' +
        'signing context: error creating MuSig2 signing context';

      // Exit early when the signing key is not a key of the session
      if (!keys.some(key => key.equals(signingKey.public_key))) {
        return cbk(makeRpcError({
          details: `${contextError}: signing key is not found in key set`,
        }));
      }

      let aggregated;

      try {
        aggregated = musig2AggregateKeys({
          keys,
          is_taproot: tweaks.is_taproot,
          script_root: tweaks.script_root,
          tweaks: tweaks.tweaks,
        });
      } catch (err) {
        return cbk(makeRpcError({details: `${contextError}: ${err.message}`}));
      }

      const generated = musig2Nonces({
        count: node.musig2.count,
        key: aggregated.key,
        private_key: signingKey.private_key,
      });

      // A pre-generated secret nonce has the public nonce of its scalars
      const secretNonce = hasNonce ? pregenerated : generated.secret_nonce;

      const scalars = [0, 1].map(n => {
        const start = n * hashByteLength;

        return pregenerated.subarray(start, start + hashByteLength);
      });

      // Exit early when a pre-generated nonce has a scalar that is not valid
      if (hasNonce && !scalars.every(isPrivate)) {
        return cbk(makeRpcError({details: invalidLocalNonce}));
      }

      const publicNonce = (() => {
        // Exit early when the nonce is generated
        if (!hasNonce) {
          return generated.public_nonce;
        }

        const points = scalars.map(n => pointFromScalar(n, true));

        return Buffer.concat(points.map(n => Buffer.from(n)));
      })();

      const coefficient = aggregated.coefficients.find(signer => {
        return signer.public_key.equals(signingKey.public_key);
      });

      let session;

      try {
        session = withAllNonces({
          gacc: aggregated.gacc,
          key: aggregated.key,
          key_coefficient: coefficient.coefficient,
          nonces: [publicNonce].concat(nonces),
          private_key: signingKey.private_key,
          secret_nonce: secretNonce,
          signatures: [],
          signers: keys.length,
          tacc: aggregated.tacc,
        });
      } catch (err) {
        return cbk(makeRpcError({
          details: 'error registering session: error registering other ' +
            `signer public nonce: ${err.message}`,
        }));
      }

      const sessionId = sha256(Buffer.concat([aggregated.key, publicNonce]));

      node.musig2.count += 1;

      // A session that is registered again starts over, as LND accepts it
      node.musig2.sessions[bufferAsHex(sessionId)] = session;

      const internalKey = xOnly(aggregated.internal_key);
      const noKey = Buffer.alloc(0);

      return cbk(null, {
        combined_key: xOnly(aggregated.key),
        have_all_nonces: !!session.nonce,
        local_public_nonces: Buffer.from(publicNonce),
        session_id: sessionId,
        taproot_internal_key: tweaks.is_taproot ? internalKey : noKey,
        version: versionName,
      });
    },
    muSig2RegisterNonces: (args, cbk) => {
      const idProblem = sessionIdProblem(args.session_id);

      // Exit early when the session id is not a session id
      if (!!idProblem) {
        return cbk(makeRpcError({details: idProblem}));
      }

      const nonces = (args.other_signer_public_nonces || []).map(n => {
        return Buffer.from(n);
      });

      // Exit early when there are no nonces to register
      if (!nonces.length) {
        return cbk(makeRpcError({
          details: 'error parsing other nonces: at least one other signer ' +
            'public nonce is required',
        }));
      }

      const nonceProblem = noncesProblem(nonces);

      // Exit early when a nonce is not the size of a nonce
      if (!!nonceProblem) {
        return cbk(makeRpcError({
          details: `error parsing other nonces: ${nonceProblem}`,
        }));
      }

      const id = bufferAsHex(args.session_id);
      const session = sessionOf(args.session_id);
      const prefix = 'error registering nonces';

      // Exit early when there is no such session
      if (!session) {
        return cbk(makeRpcError({
          details: `${prefix}: session with ID ${id} not found`,
        }));
      }

      // Exit early when the session already has all of its nonces
      if (!!session.nonce) {
        return cbk(makeRpcError({
          details: `${prefix}: already have all nonces`,
        }));
      }

      const remaining = session.signers - session.nonces.length;

      // Exit early when there are more nonces than signers
      if (nonces.length > remaining) {
        return cbk(makeRpcError({
          details: `${prefix}: only ${remaining} other nonces remaining ` +
            `but trying to register ${nonces.length} more`,
        }));
      }

      let updated;

      try {
        updated = withAllNonces({
          ...session,
          nonces: session.nonces.concat(nonces),
        });
      } catch (err) {
        return cbk(makeRpcError({
          details: `${prefix}: error registering other signer public ` +
            `nonce: ${err.message}`,
        }));
      }

      node.musig2.sessions[id] = updated;

      return cbk(null, {have_all_nonces: !!updated.nonce});
    },
    muSig2Sign: (args, cbk) => {
      const idProblem = sessionIdProblem(args.session_id);

      // Exit early when the session id is not a session id
      if (!!idProblem) {
        return cbk(makeRpcError({details: idProblem}));
      }

      const digest = Buffer.from(args.message_digest || []);

      // Exit early when the message is not a digest
      if (digest.length !== hashByteLength) {
        return cbk(makeRpcError({
          details: `invalid message digest size, got ${digest.length} ` +
            `but expected ${hashByteLength}`,
        }));
      }

      const id = bufferAsHex(args.session_id);
      const session = sessionOf(args.session_id);

      // Exit early when there is no such session
      if (!session) {
        return cbk(makeRpcError({
          details: `error signing: session with ID ${id} not found`,
        }));
      }

      // Exit early when the session does not have all of its nonces
      if (!session.nonce) {
        return cbk(makeRpcError({
          details: `error signing: only have ${session.nonces.length} of ` +
            `${session.signers} required nonces`,
        }));
      }

      const signError = 'error signing: error signing with local key: ' +
        'error signing with local key';

      // Exit early when the session already signed with its nonce
      if (!session.secret_nonce) {
        return cbk(makeRpcError({
          details: `${signError}: nonce already used`,
        }));
      }

      const publicKey = pointFromScalar(session.private_key, true);

      const noncePublicKey = session.secret_nonce.subarray(hashByteLength * 2);

      // Exit early when a pre-generated nonce is for a different key
      if (!noncePublicKey.equals(Buffer.from(publicKey))) {
        return cbk(makeRpcError({
          details: `${signError}: public key does not match secnonce`,
        }));
      }

      let signature;

      try {
        signature = musig2PartialSign({
          gacc: session.gacc,
          key: session.key,
          key_coefficient: session.key_coefficient,
          message: digest,
          nonce: session.nonce,
          private_key: session.private_key,
          secret_nonce: session.secret_nonce.subarray(0, hashByteLength * 2),
        })
        .signature;
      } catch (err) {
        return cbk(makeRpcError({details: `${signError}: ${err.message}`}));
      }

      node.musig2.sessions[id] = {
        ...session,
        message: digest,
        secret_nonce: null,
        signatures: session.signatures.concat(signature),
      };

      // A session is ended after signing when the signer asks for cleanup
      if (!!args.cleanup) {
        delete node.musig2.sessions[id];
      }

      return cbk(null, {local_partial_signature: Buffer.from(signature)});
    },
  };
};
