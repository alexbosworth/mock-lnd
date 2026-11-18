const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const chainConfirmation = require('./chain_confirmation');
const chainSpend = require('./chain_spend');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const reversed = hex => Buffer.from(hex, 'hex').reverse();

/** Tell chain subscriptions of a fake node about an update of the chain, as
  LND tells chain notifier streams

  Every stream is told about the chain as it was when the update was made,
  even when a listener changes the chain while the streams are told. A stream
  that is canceled, maybe by a listener, is told about nothing more.

  {
    blocks: [<Block Object>]
    connected: [<Connected Block Object>]
    node: {
      chain: <Fake Chain Object>
    }
    [subscriptions]: [<Chain Subscription Object>]
  }
*/
module.exports = ({blocks, connected, node, subscriptions}) => {
  const {chain} = node;
  const [tip] = blocks.slice(-1);

  const ids = blocks.map(n => n.id);

  // Streams are told about the chain once they are returned
  const active = (subscriptions || chain.subscriptions).filter(n => {
    return !n.stream.is_canceled && !n.is_waiting;
  });

  return active.forEach(subscription => {
    const {request, stream} = subscription;

    // Tell the stream about data, unless the stream is canceled
    const tell = data => {
      // Exit early when the stream is canceled, maybe by a listener
      if (!!stream.is_canceled) {
        return;
      }

      return stream.emit('data', data);
    };

    // Exit early when telling a subscription about blocks
    if (subscription.type === 'blocks') {
      return connected.forEach(block => {
        // Bytes are copied, as gRPC gives new bytes
        return tell({hash: Buffer.from(block.hash), height: block.height});
      });
    }

    const isConf = subscription.type === 'conf';

    // A stream is told of a reorg when the block it was told of is gone
    if (!!subscription.sent && !ids.includes(subscription.sent)) {
      subscription.sent = undefined;

      const reorg = isConf ? {conf: null} : {spend: null};

      tell({...reorg, event: 'reorg', reorg: {}});
    }

    // Exit early when the stream was already told of the block
    if (!!subscription.sent) {
      return;
    }

    // Exit early when telling a subscription about a confirmation
    if (isConf) {
      const conf = chainConfirmation({blocks, request});

      // Exit early when there is no confirmation
      if (!conf.block) {
        return;
      }

      const confirmations = tip.height - conf.block.height + 1;

      // Exit early when there are not enough confirmations yet
      if (confirmations < request.num_confs) {
        return;
      }

      subscription.sent = conf.block.id;

      const rawBlock = !!request.include_block ? conf.block.block : [];

      const data = {
        conf: {
          block_hash: Buffer.from(conf.block.hash),
          block_height: conf.block.height,
          raw_block: Buffer.from(rawBlock),
          raw_tx: hexAsBuffer(conf.transaction),
          tx_index: conf.index,
        },
        event: 'conf',
        reorg: null,
      };

      return tell(data);
    }

    const spend = chainSpend({blocks, request});

    // Exit early when there is no spend
    if (!spend.block) {
      return;
    }

    subscription.sent = spend.block.id;

    const {id} = idForTransaction({transaction: spend.transaction});

    const {inputs} = componentsOfTransaction({transaction: spend.transaction});

    const spent = inputs[spend.vin];

    const data = {
      event: 'spend',
      reorg: null,
      spend: {
        raw_spending_tx: hexAsBuffer(spend.transaction),
        spending_height: spend.block.height,
        spending_input_index: spend.vin,
        spending_outpoint: {hash: reversed(spent.id), index: spent.vout},
        spending_tx_hash: reversed(id),
      },
    };

    return tell(data);
  });
};
