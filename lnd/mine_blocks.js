const {idForTransaction} = require('@alexbosworth/blockchain');

const {blockTransactionsCheck} = require('./../node');
const {extendChain} = require('./../node');
const fakeNodes = require('./fake_nodes');
const {isRawTransaction} = require('./../node');
const maxBlockHeight = require('./../node/max_block_height');
const {updateChainStreams} = require('./../node');

const idOf = transaction => idForTransaction({transaction}).id;
const {isArray} = Array;
const isCount = n => Number.isInteger(n) && n > 0;
const range = n => [...Array(n).keys()];

/** Mine blocks on the chain of a fake LND

  {
    [count]: <Count of Blocks to Mine Number>
    lnd: <Fake LND Object>
    [transactions]: [<Raw Transaction Hex String>]
  }

  @throws
  <Error>

  @returns
  {
    blocks: [{
      height: <Block Height Number>
      id: <Block Id Hex String>
    }]
  }
*/
module.exports = ({count, lnd, transactions}) => {
  const node = fakeNodes.get(lnd);

  if (!node) {
    throw new Error('ExpectedFakeLndToMineBlocks');
  }

  if (count !== undefined && !isCount(count)) {
    throw new Error('ExpectedPositiveCountOfBlocksToMine');
  }

  if (transactions !== undefined && !isArray(transactions)) {
    throw new Error('ExpectedArrayOfTransactionsToMineBlocks');
  }

  const mined = transactions || [];

  if (!mined.every(transaction => isRawTransaction({transaction}))) {
    throw new Error('ExpectedRawTransactionsToMineBlocks');
  }

  const ids = mined.map(idOf);

  // Transactions to mine are checked before mempool transactions are skipped
  if (ids.some((id, i) => ids.indexOf(id) !== i)) {
    throw new Error('ExpectedUniqueTransactionsToMineBlocks');
  }

  const pending = node.chain.mempool.map(idOf);

  // Transactions in the mempool are not mined twice
  const added = mined.filter(n => !pending.includes(idOf(n)));

  const check = blockTransactionsCheck({
    blocks: node.chain.blocks,
    transactions: node.chain.mempool.concat(added),
  });

  if (check.is_repeated) {
    throw new Error('ExpectedUniqueTransactionsToMineBlocks');
  }

  if (check.is_confirmed) {
    throw new Error('ExpectedUnconfirmedTransactionsToMineBlocks');
  }

  if (check.is_conflicting) {
    throw new Error('ExpectedNoConflictingTransactionsToMineBlocks');
  }

  if (check.is_spent) {
    throw new Error('ExpectedUnspentOutputsToMineBlocks');
  }

  const [tip] = node.chain.blocks.slice(-1);

  if (tip.height + (count || 1) > maxBlockHeight) {
    throw new Error('ExpectedBlocksWithinMaxHeightToMineBlocks');
  }

  // The first block confirms the mempool, then later blocks are empty
  const blocks = range(count || 1).map(i => ({
    transactions: !i ? node.chain.mempool.concat(added) : [],
  }));

  const {connected} = extendChain({blocks, node, height: tip.height + 1});

  updateChainStreams({connected, node});

  return {blocks: connected.map(n => ({height: n.height, id: n.id}))};
};
