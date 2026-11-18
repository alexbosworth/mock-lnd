const {blockTransactionsCheck} = require('./../node');
const {extendChain} = require('./../node');
const fakeNodes = require('./fake_nodes');
const {isRawTransaction} = require('./../node');
const maxBlockHeight = require('./../node/max_block_height');
const {updateChainStreams} = require('./../node');

const {isArray} = Array;
const isHeight = n => Number.isInteger(n) && n >= 0;
const isObject = n => !!n && typeof n === 'object' && !Array.isArray(n);
const range = n => [...Array(n).keys()];

/** Reorganize the chain of a fake LND, replacing the blocks from a height

  {
    [blocks]: [{
      [transactions]: [<Raw Transaction Hex String>]
    }]
    height: <Height of the First Replaced Block Number>
    lnd: <Fake LND Object>
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
module.exports = ({blocks, height, lnd}) => {
  const node = fakeNodes.get(lnd);

  if (!node) {
    throw new Error('ExpectedFakeLndToReorgChain');
  }

  if (!isHeight(height)) {
    throw new Error('ExpectedHeightOfFirstReplacedBlockToReorgChain');
  }

  const [first] = node.chain.blocks;
  const [tip] = node.chain.blocks.slice(-1);

  if (height < first.height || height > tip.height) {
    throw new Error('ExpectedHeightOfBlockInChainToReorgChain');
  }

  if (blocks !== undefined && !isArray(blocks)) {
    throw new Error('ExpectedArrayOfBlocksToReorgChain');
  }

  const replacedCount = tip.height - height + 1;

  // By default the new chain is empty blocks, one more than were replaced
  const emptyBlocks = range(replacedCount + 1).map(() => ({}));

  const replacements = blocks || emptyBlocks;

  if (!replacements.every(isObject)) {
    throw new Error('ExpectedBlockObjectsToReorgChain');
  }

  // A chain backend only switches to a chain with more work
  if (replacements.length <= replacedCount) {
    throw new Error('ExpectedMoreBlocksThanReplacedBlocksToReorgChain');
  }

  if (height + replacements.length - 1 > maxBlockHeight) {
    throw new Error('ExpectedBlocksWithinMaxHeightToReorgChain');
  }

  const blockTransactions = replacements.map(n => n.transactions || []);

  if (!blockTransactions.every(isArray)) {
    throw new Error('ExpectedArrayOfTransactionsForBlockToReorgChain');
  }

  const transactions = blockTransactions.flat();

  if (!transactions.every(transaction => isRawTransaction({transaction}))) {
    throw new Error('ExpectedRawTransactionsToReorgChain');
  }

  const check = blockTransactionsCheck({
    transactions,
    blocks: node.chain.blocks.filter(n => n.height < height),
  });

  if (check.is_repeated) {
    throw new Error('ExpectedUniqueTransactionsToReorgChain');
  }

  if (check.is_confirmed) {
    throw new Error('ExpectedUnconfirmedTransactionsToReorgChain');
  }

  if (check.is_conflicting) {
    throw new Error('ExpectedNoConflictingTransactionsToReorgChain');
  }

  if (check.is_spent) {
    throw new Error('ExpectedUnspentOutputsToReorgChain');
  }

  const {connected} = extendChain({height, node, blocks: replacements});

  updateChainStreams({connected, node});

  return {blocks: connected.map(n => ({height: n.height, id: n.id}))};
};
