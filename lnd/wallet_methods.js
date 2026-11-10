const {deriveKey} = require('./../node');
const {makeChainFeeRateResponse} = require('./../data');
const {makeFundPsbtResponse} = require('./../data');
const {makeGetUtxosResponse} = require('./../data');
const {makeRpcError} = require('./../data');
const {makeSignPsbtResponse} = require('./../data');

const invalidLocator = 'invalid key locator';
const isLocatorNumber = n => Number.isInteger(n) && n >= 0 && n < 2 ** 31;

/** Make the methods of the wallet sub-server of a fake node

  {
    node: <Fake Node Object>
    overrides: <Method Overrides Object>
  }

  @returns
  {
    <Method Name String>: <RPC Method Function>
  }
*/
module.exports = ({node, overrides}) => {
  const invalidKeyLocator = () => makeRpcError({details: invalidLocator});

  // A key descriptor for a key locator
  const keyAt = ({family, index}) => ({
    key_loc: {key_family: family, key_index: index},
    raw_key_bytes: deriveKey({
      family,
      index,
      keys: node.keys,
      secret: node.secret,
    })
    .public_key,
  });

  return {
    deriveKey: (args, cbk) => {
      const family = args.key_family || Number();
      const index = args.key_index || Number();

      // Exit early when the key locator is not valid
      if (!isLocatorNumber(family) || !isLocatorNumber(index)) {
        return cbk(invalidKeyLocator());
      }

      return cbk(null, keyAt({family, index}));
    },
    deriveNextKey: (args, cbk) => {
      const family = args.key_family || Number();

      // Exit early when the key family is not valid
      if (!isLocatorNumber(family)) {
        return cbk(invalidKeyLocator());
      }

      // Keys in a family are derived one after another from the next index
      const index = node.next_key_indexes[family] || Number();

      node.next_key_indexes[family] = index + 1;

      return cbk(null, keyAt({family, index}));
    },
    estimateFee: ({}, cbk) => cbk(null, makeChainFeeRateResponse({})),
    finalizePsbt: (args, cbk) => {
      // Exit early when there is a custom sign PSBT response
      if (!!overrides.signPsbt) {
        return overrides.signPsbt(args, cbk);
      }

      return cbk(null, makeSignPsbtResponse({}));
    },
    fundPsbt: (args, cbk) => {
      // Exit early when there is a custom fund PSBT response
      if (!!overrides.fundPsbt) {
        return overrides.fundPsbt(args, cbk);
      }

      return cbk(null, makeFundPsbtResponse({}));
    },
    listUnspent: ({}, cbk) => {
      // Exit early when there is a custom utxos response
      if (!!overrides.getUtxos) {
        return overrides.getUtxos({}, cbk);
      }

      return cbk(null, makeGetUtxosResponse({}));
    },
    releaseOutput: ({}, cbk) => cbk(null, {status: ''}),
  };
};
