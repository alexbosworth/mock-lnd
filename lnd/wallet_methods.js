const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const {deriveKey} = require('./../node');
const {isRawTransaction} = require('./../node');
const {mempoolDescendants} = require('./../node');
const {makeChainFeeRateResponse} = require('./../data');
const {makeFundPsbtResponse} = require('./../data');
const {makeGetUtxosResponse} = require('./../data');
const {makeRpcError} = require('./../data');
const {makeSignPsbtResponse} = require('./../data');

const bufferAsHex = buffer => Buffer.from(buffer || []).toString('hex');
const doubleSpend = 'transaction rejected: output already spent';
const idOf = transaction => idForTransaction({transaction}).id;
const invalidLocator = 'invalid key locator';
const isLocatorNumber = n => Number.isInteger(n) && n >= 0 && n < 2 ** 31;
const notDecoded = 'unexpected EOF';
const noTransaction = 'must provide a transaction to publish';

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

  // The outpoints that a transaction spends
  const outpointsOf = transaction => {
    const {inputs} = componentsOfTransaction({transaction});

    return inputs.map(n => `${n.id}:${n.vout}`);
  };

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

      // LND finds keys it derived next when signing for their public keys
      node.derived_next_keys.push({family, index});

      return cbk(null, keyAt({family, index}));
    },
    estimateFee: ({}, cbk) => {
      return cbk(null, makeChainFeeRateResponse({
        tokens_per_vbyte: node.chain.fee_tokens_per_vbyte,
      }));
    },
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
    publishTransaction: (args, cbk) => {
      const transaction = bufferAsHex(args.tx_hex);

      // Exit early when there is no transaction to publish
      if (!transaction) {
        return cbk(makeRpcError({details: noTransaction}));
      }

      // Exit early when the transaction cannot be decoded
      if (!isRawTransaction({transaction})) {
        return cbk(makeRpcError({details: notDecoded}));
      }

      const id = idOf(transaction);

      const confirmed = node.chain.blocks.flatMap(block => {
        return block.transactions.slice(1);
      });

      const known = confirmed.concat(node.chain.mempool).map(idOf);

      // Exit early when the transaction is in the chain or the mempool
      if (known.includes(id)) {
        return cbk(null, {publish_error: ''});
      }

      const spends = outpointsOf(transaction);

      const spent = confirmed.flatMap(outpointsOf);

      // Exit early when the transaction spends an output spent in the chain
      if (spends.some(n => spent.includes(n))) {
        return cbk(makeRpcError({details: doubleSpend}));
      }

      // Transactions in the mempool that spend the same outputs are replaced
      const replaced = node.chain.mempool.filter(pending => {
        return outpointsOf(pending).some(n => spends.includes(n));
      });

      // Transactions that spend the outputs of replaced ones are evicted
      const {descendants} = mempoolDescendants({
        ids: replaced.map(idOf),
        mempool: node.chain.mempool.filter(n => !replaced.includes(n)),
      });

      const evicted = replaced.concat(descendants);

      const kept = node.chain.mempool.filter(n => !evicted.includes(n));

      node.chain.mempool = kept.concat(transaction);

      return cbk(null, {publish_error: ''});
    },
    releaseOutput: ({}, cbk) => cbk(null, {status: ''}),
  };
};
