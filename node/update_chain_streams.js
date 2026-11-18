const chainStreamUpdate = require('./chain_stream_update');

/** Update the chain subscriptions of a fake node with the chain, as LND
  updates chain notifier streams

  Updates are sent to every stream one at a time, in the order they are made.
  An update made by a listener, like mining a block from a block listener,
  waits until every stream is told about the update before it. An update has
  the blocks of the chain when it is made, so a listener that changes the
  chain does not change what other streams are told about the update.

  {
    connected: [<Connected Block Object>]
    node: {
      chain: {
        [is_updating]: <Streams Are Being Told About an Update Bool>
        blocks: [<Block Object>]
        updates: [<Waiting Chain Update Object>]
      }
    }
    [subscriptions]: [<Chain Subscription Object>]
  }
*/
module.exports = ({connected, node, subscriptions}) => {
  const {chain} = node;

  chain.updates.push({connected, subscriptions, blocks: chain.blocks.slice()});

  // Exit early when streams are being updated, so the update waits its turn
  if (!!chain.is_updating) {
    return;
  }

  chain.is_updating = true;

  // A listener that throws leaves later updates for the next update
  try {
    while (!!chain.updates.length) {
      const update = chain.updates.shift();

      chainStreamUpdate({
        node,
        blocks: update.blocks,
        connected: update.connected,
        subscriptions: update.subscriptions,
      });
    }
  } finally {
    chain.is_updating = false;
  }
};
