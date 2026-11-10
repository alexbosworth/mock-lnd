const {deriveKey} = require('./../node');
const {deriveSharedKey} = require('./../node');
const {makeRpcError} = require('./../data');
const {signMessage} = require('./../node');

const identityLocator = {key_family: 6, key_index: 0};
const invalidKeyLocator = 'invalid key locator';
const invalidPublicKey = 'unable to parse ephemeral pubkey';
const isLocatorNumber = n => Number.isInteger(n) && n >= 0 && n < 2 ** 31;
const mutuallyExclusiveKeys = 'use either key_desc or key_loc';
const noKeyLocator = 'a key locator MUST be passed in';
const noMessage = 'a message to sign MUST be passed in';

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
  };
};
