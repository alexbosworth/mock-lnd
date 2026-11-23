const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {privateAdd} = require('tiny-secp256k1');

const {deriveKey} = require('./../node');
const {deriveSharedKey} = require('./../node');
const {makeRpcError} = require('./../data');
const {publicKeyProblem} = require('./../node');
const {signMessage} = require('./../node');
const {signOutput} = require('./../node');
const {requestAsSent} = require('./../protos');

const bufferAsHex = buffer => Buffer.from(buffer || []).toString('hex');
const compressedKeyByteLength = 33;
const hashByteLength = 32;
const identityKey = {family: 6, index: 0};
const identityLocator = {key_family: 6, key_index: 0};
const internalCode = 13;
const invalidKeyLocator = 'invalid key locator';
const invalidPublicKey = 'unable to parse ephemeral pubkey';
const isLocatorNumber = n => Number.isInteger(n) && n >= 0 && n < 2 ** 31;
const isP2sh = script => /^a914[0-9a-f]{40}87$/.test(script);
const isP2tr = script => /^5120[0-9a-f]{64}$/.test(script);
const isP2wpkh = script => /^0014[0-9a-f]{40}$/.test(script);
const isP2wsh = script => /^0020[0-9a-f]{64}$/.test(script);
const methodNames = ['witness_v0', 'taproot_key_spend_bip86', 'taproot_key_spend', 'taproot_script_spend'];
const mutuallyExclusiveKeys = 'use either key_desc or key_loc';
const noKeyLocator = 'a key locator MUST be passed in';
const noMessage = 'a message to sign MUST be passed in';
const noSignDescs = 'at least one SignDescs MUST be passed in';
const notDecoded = 'unable to decode tx: unexpected EOF';
const noTransaction = 'a transaction to sign MUST be passed in';
const outputsMismatch = 'provided previous outputs doesn\'t match number of transaction inputs';
const requestNotEncoded = 'Request message serialization failure: ';
const rpcSignMethods = ['SIGN_METHOD_WITNESS_V0', 'SIGN_METHOD_TAPROOT_KEY_SPEND_BIP0086', 'SIGN_METHOD_TAPROOT_KEY_SPEND', 'SIGN_METHOD_TAPROOT_SCRIPT_SPEND'];
const unsupportedDoubleTweak = 'double tweaks are not supported by the mock LND';
const tokensOf = output => Number(!output ? 0 : output.value);

/** Make the methods of the signer sub-server of a fake node

  {
    node: <Fake Node Object>
  }

  @returns
  {
    <Method Name String>: <RPC Method Function>
  }
*/
module.exports = ({node}) => {
  // The private key at a key locator, when the locator is a valid locator
  const keyAt = locator => {
    const family = locator.key_family || Number();
    const index = locator.key_index || Number();

    // Exit early when the key locator is not valid
    if (!isLocatorNumber(family) || !isLocatorNumber(index)) {
      return {};
    }

    const {keys, secret} = node;

    return {private_key: deriveKey({family, index, keys, secret}).private_key};
  };

  // The private key for a key descriptor, as LND finds the key to sign with
  const signingKey = descriptor => {
    const locator = descriptor.key_loc || {};
    const rawKey = bufferAsHex(descriptor.raw_key_bytes);

    const isEmptyLocator = !locator.key_family && !locator.key_index;

    // Exit early when the key is identified by its key locator
    if (!isEmptyLocator || !rawKey) {
      return keyAt(locator);
    }

    const {keys, secret} = node;

    // Keys from deriveNextKey are known by their public keys, like LND keys
    const locators = [identityKey].concat(keys, node.derived_next_keys);

    // A key without a locator is one of the known keys of the node
    const known = locators.map(key => {
      return deriveKey({keys, secret, family: key.family, index: key.index});
    });

    const match = known.find(key => bufferAsHex(key.public_key) === rawKey);

    // LND signs with the key at the empty locator when the key is not known
    return !match ? keyAt(locator) : {private_key: match.private_key};
  };

  return {
    deriveSharedKey: (args, cbk) => {
      // Exit early when both a key descriptor and key locator are given
      if (!!args.key_desc && !!args.key_loc) {
        return cbk(makeRpcError({details: mutuallyExclusiveKeys}));
      }

      const descriptor = args.key_desc || {};

      const locator = args.key_loc || descriptor.key_loc || identityLocator;

      const key = keyAt(locator);

      // Exit early when the key locator is not valid
      if (!key.private_key) {
        return cbk(makeRpcError({details: invalidKeyLocator}));
      }

      let sharedKey;

      try {
        sharedKey = deriveSharedKey({
          ephemeral_pubkey: args.ephemeral_pubkey,
          private_key: key.private_key,
        })
        .shared_key;
      } catch (err) {
        return cbk(makeRpcError({details: invalidPublicKey}));
      }

      return cbk(null, {shared_key: sharedKey});
    },
    signMessage: (args, cbk) => {
      // Exit early when there is no message to sign
      if (!args.msg || !args.msg.length) {
        return cbk(makeRpcError({details: noMessage}));
      }

      // Exit early when there is no key locator for the key to sign with
      if (!args.key_loc) {
        return cbk(makeRpcError({details: noKeyLocator}));
      }

      const key = keyAt(args.key_loc);

      // Exit early when the key locator is not valid
      if (!key.private_key) {
        return cbk(makeRpcError({details: invalidKeyLocator}));
      }

      let signature;

      try {
        signature = signMessage({
          compact_sig: args.compact_sig,
          double_hash: args.double_hash,
          msg: args.msg,
          private_key: key.private_key,
          schnorr_sig: args.schnorr_sig,
          schnorr_sig_tap_tweak: args.schnorr_sig_tap_tweak,
          tag: args.tag,
        })
        .signature;
      } catch (err) {
        return cbk(makeRpcError({details: err.message}));
      }

      return cbk(null, {signature});
    },
    signOutputRaw: (args, cbk) => {
      const descs = args.sign_descs || [];
      const outputs = args.prev_outputs || [];

      // The gRPC client encodes the request before LND gets it
      const sent = (() => {
        try {
          return requestAsSent({
            method: 'signOutputRaw',
            request: args,
            type: 'signer',
          });
        } catch (err) {
          return {problem: err.message};
        }
      })();

      // Exit early when the request cannot be encoded by the gRPC client
      if (!!sent.problem) {
        return cbk(makeRpcError({
          code: internalCode,
          details: `${requestNotEncoded}${sent.problem}`,
        }));
      }

      // Values are int64s that LND gets as whole tokens
      const values = {
        descs: sent.request.sign_descs.map(n => tokensOf(n.output)),
        outputs: sent.request.prev_outputs.map(n => tokensOf(n)),
      };

      const rawTx = Buffer.from(args.raw_tx_bytes || []);

      // Exit early when there is no transaction to sign
      if (!rawTx.length) {
        return cbk(makeRpcError({details: noTransaction}));
      }

      // Exit early when there is nothing to sign in the transaction
      if (!descs.length) {
        return cbk(makeRpcError({details: noSignDescs}));
      }

      const transaction = bufferAsHex(rawTx);

      let inputs;

      try {
        inputs = componentsOfTransaction({transaction}).inputs;
      } catch (err) {
        return cbk(makeRpcError({details: notDecoded}));
      }

      // Exit early when the spent outputs are not the outputs of the inputs
      if (!!outputs.length && outputs.length !== inputs.length) {
        return cbk(makeRpcError({details: outputsMismatch}));
      }

      const spends = outputs.map((output, i) => ({
        script: bufferAsHex(output.pk_script),
        tokens: values.outputs[i],
      }));

      // Sign descriptors are checked as LND checks them before signing
      const signings = descs.map((desc, i) => {
        const keyDesc = desc.key_desc || {};
        const output = desc.output || {};

        const rawKey = Buffer.from(keyDesc.raw_key_bytes || []);
        const tapTweak = Buffer.from(desc.tap_tweak || []);
        const witnessScript = Buffer.from(desc.witness_script || []);

        const isRawKey = !!rawKey.length;

        // Exit early when a raw key is not a compressed public key
        if (isRawKey && rawKey.length !== compressedKeyByteLength) {
          return {
            problem: 'pubkey must be serialized in compressed format if ' +
              'specified',
          };
        }

        // A raw key is a point on the curve, as LND parses the key
        const keyProblem = !isRawKey ? {} : publicKeyProblem({key: rawKey});

        // Exit early when a raw key is not a public key
        if (!!keyProblem.problem) {
          return {problem: keyProblem.problem};
        }

        const method = (() => {
          // Exit early when the sign method is given by its name
          if (rpcSignMethods.includes(desc.sign_method)) {
            return rpcSignMethods.indexOf(desc.sign_method);
          }

          return desc.sign_method || Number();
        })();

        // Exit early when the sign method is not a sign method
        if (!methodNames[method]) {
          return {
            problem: 'unable to unmarshal sign method: unknown RPC sign ' +
              `method <${method}>`,
          };
        }

        const script = bufferAsHex(output.pk_script);

        const isV0 = [isP2sh, isP2wpkh, isP2wsh].some(is => is(script));

        const isCompatible = !method ? isV0 : isP2tr(script);

        // Exit early when the sign method is not for the output script
        if (!isCompatible) {
          return {
            problem: `selected sign method ${methodNames[method]} is not ` +
              `compatible with given pk script ${script}`,
          };
        }

        // Exit early when there is no script to sign a v0 output with
        if (method === 0 && !witnessScript.length) {
          return {
            problem: 'witness script MUST be specified for segwit v0 ' +
              'sign method',
          };
        }

        // Exit early when a BIP-86 key spend has a tweak
        if (method === 1 && !!tapTweak.length) {
          return {problem: 'tap tweak must be empty for BIP0086 key spend'};
        }

        // Exit early when a key spend has no script root to tweak with
        if (method === 2 && tapTweak.length !== hashByteLength) {
          return {
            problem: 'tap tweak must be specified for key spend with root ' +
              'hash',
          };
        }

        // Exit early when a script spend has no script
        if (method === 3 && !witnessScript.length) {
          return {
            problem: 'witness script MUST be specified for taproot script ' +
              'spend method',
          };
        }

        // Exit early when a taproot spend is missing spent outputs
        if (isP2tr(script) && !outputs.length) {
          return {
            problem: 'error signing taproot output, transaction input 0 is ' +
              'missing its previous outpoint information',
          };
        }

        // Exit early when there is a double tweak
        if (!!desc.double_tweak && !!desc.double_tweak.length) {
          return {problem: unsupportedDoubleTweak};
        }

        return {
          method,
          script,
          tapTweak,
          witnessScript,
          desc: {...desc, key_desc: keyDesc},
          tokens: values.descs[i],
        };
      });

      const failed = signings.find(n => !!n.problem);

      // Exit early when a sign descriptor is not valid
      if (!!failed) {
        return cbk(makeRpcError({details: failed.problem}));
      }

      let signatures;

      try {
        signatures = signings.map(signing => {
          const key = signingKey(signing.desc.key_desc);

          // Exit early when the key locator is not valid
          if (!key.private_key) {
            throw new Error(invalidKeyLocator);
          }

          const vin = signing.desc.input_index || Number();

          // Exit early when the input is not an input of the transaction
          if (vin >= inputs.length) {
            throw new Error(`idx ${vin} but ${inputs.length} txins`);
          }

          const tweak = Buffer.from(signing.desc.single_tweak || []);

          // A single tweak is added to the private key
          const privateKey = (() => {
            // Exit early when there is no tweak
            if (!tweak.length) {
              return key.private_key;
            }

            return Buffer.from(privateAdd(key.private_key, tweak));
          })();

          return signOutput({
            method: signing.method,
            output_script: signing.script,
            output_tokens: signing.tokens,
            private_key: privateKey,
            sighash: signing.desc.sighash || Number(),
            spends: !outputs.length ? undefined : spends,
            tap_tweak: signing.tapTweak,
            transaction,
            vin,
            witness_script: signing.witnessScript,
          })
          .signature;
        });
      } catch (err) {
        return cbk(makeRpcError({details: err.message}));
      }

      return cbk(null, {raw_sigs: signatures});
    },
  };
};
