const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const makeBlock = require('./make_block');
const mempoolDescendants = require('./mempool_descendants');

const outpoint = n => `${n.id}:${n.vout}`;

/** Extend the chain of a fake node with blocks from a height, replacing the
  blocks of the chain from that height

  {
    blocks: [{
      [transactions]: [<Raw Transaction Hex String>]
    }]
    height: <Height of the First New Block Number>
    node: {
      chain: <Fake Chain Object>
    }
  }

  @returns
  {
    connected: [<Block Object>]
  }
*/
module.exports = ({blocks, height, node}) => {
  const {chain} = node;

  const kept = chain.blocks.filter(n => n.height < height);
  const replaced = chain.blocks.filter(n => n.height >= height);

  const [last] = kept.slice(-1);

  // The first new block builds on the last block that is kept
  const previous = !last ? replaced[0].header.subarray(4, 36) : last.hash;

  const connected = blocks.reduce((sum, block, i) => {
    const [before] = sum.slice(-1);

    return sum.concat(makeBlock({
      height: height + i,
      nonce: chain.made + i,
      previous: !before ? previous : before.hash,
      transactions: block.transactions || [],
    }));
  },
  []);

  chain.blocks = kept.concat(connected);
  chain.made += connected.length;
  // Replaced blocks can still be gotten by their hashes
  chain.stale = chain.stale.concat(replaced);

  // Transactions in the chain spend outputs, other than coinbase spends
  const confirmed = chain.blocks.flatMap(n => n.transactions.slice(1));

  const ids = confirmed.map(transaction => {
    return idForTransaction({transaction}).id;
  });

  const spent = confirmed.flatMap(transaction => {
    return componentsOfTransaction({transaction}).inputs.map(outpoint);
  });

  // Transactions of replaced blocks go back to the mempool
  const returned = replaced.flatMap(n => n.transactions.slice(1));

  const pending = returned.concat(chain.mempool);

  // The mempool keeps transactions that are not in the chain
  const unconfirmed = pending.filter((transaction, i) => {
    const {id} = idForTransaction({transaction});

    // Exit early when the transaction is in the mempool already
    if (pending.indexOf(transaction) !== i) {
      return false;
    }

    return !ids.includes(id);
  });

  // Transactions that spend outputs spent in the chain are evicted
  const conflicted = unconfirmed.filter(transaction => {
    const {inputs} = componentsOfTransaction({transaction});

    return inputs.some(n => spent.includes(outpoint(n)));
  });

  // Transactions that spend the outputs of evicted ones are evicted too
  const {descendants} = mempoolDescendants({
    ids: conflicted.map(transaction => idForTransaction({transaction}).id),
    mempool: unconfirmed.filter(n => !conflicted.includes(n)),
  });

  const evicted = conflicted.concat(descendants);

  chain.mempool = unconfirmed.filter(n => !evicted.includes(n));

  return {connected};
};
