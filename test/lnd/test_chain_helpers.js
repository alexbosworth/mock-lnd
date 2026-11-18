const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {getBlock} = require('lightning');
const {getWalletInfo} = require('lightning');
const {idForBlock} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {makeLnd} = require('./../../');
const {mineBlocks} = require('./../../');
const {reorgChain} = require('./../../');

const all = promises => Promise.all(promises);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const maxHeight = 5106601;

// A transaction that is mined in the tests
const transaction = transactionFromComponents({
  inputs: [{id: '11'.repeat(32), script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: '51', tokens: 1000}],
  version: 2,
}).transaction;

// A transaction that spends the same output as the mined transaction
const conflicting = transactionFromComponents({
  inputs: [{id: '11'.repeat(32), script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: '51', tokens: 900}],
  version: 2,
}).transaction;

// A block that has the mined transaction
const mined = {transactions: [transaction]};

// Make a fake LND with the mined transaction in its mempool
const withPending = () => {
  const lnd = makeLnd({chain: {height: 100}});

  lnd.wallet.publishTransaction({tx_hex: hexAsBuffer(transaction)}, () => {});

  return lnd;
};

// Call a helper with a fake LND, and get the message of the error
const helperError = ({args, helper}) => {
  const lnd = makeLnd({chain: {height: 100}});

  try {
    helper({lnd, ...args});

    return null;
  } catch (err) {
    return err.message;
  }
};

// Mine blocks, and check the blocks that are mined are the tip of the chain
const minedBlocks = async ({count}) => {
  const lnd = makeLnd({chain: {height: 100}});

  const {blocks} = mineBlocks({count, lnd, transactions: [transaction]});

  const [tip] = blocks.slice(-1);

  const info = await getWalletInfo({lnd});

  const first = await getBlock({lnd, height: 101});

  return {
    heights: blocks.map(n => n.height),
    is_mined: first.block.includes(transaction),
    is_tip: info.current_block_hash === tip.id,
  };
};

// Mine a transaction, reorganize the chain, and get where the transaction is
const reorgedTransaction = async ({blocks}) => {
  const lnd = makeLnd({chain: {height: 100}});

  mineBlocks({lnd, transactions: [transaction]});

  const reorg = reorgChain({blocks, lnd, height: 101});

  const {block} = await getBlock({lnd, height: 101});

  const next = mineBlocks({lnd}).blocks;

  const mined = await getBlock({lnd, id: next[0].id});

  return {
    heights: reorg.blocks.map(n => n.height),
    in_replaced_block: block.includes(transaction),
    in_next_block: mined.block.includes(transaction),
  };
};

// Make two fake LNDs with the same chain, and check the tips are the same
const isSameTip = async ({chain}) => {
  const [lnd, same] = [makeLnd({chain}), makeLnd({chain})];

  const tips = await all([lnd, same].map(n => getBlock({lnd: n})));

  const [tip, sameTip] = tips.map(({block}) => idForBlock({block}).id);

  return tip === sameTip;
};

const tests = [
  {
    args: {args: {lnd: {}}, helper: mineBlocks},
    description: 'Blocks are mined on a fake LND',
    expected: 'ExpectedFakeLndToMineBlocks',
    method: helperError,
  },
  {
    args: {args: {count: 0}, helper: mineBlocks},
    description: 'A count of blocks to mine is a positive count',
    expected: 'ExpectedPositiveCountOfBlocksToMine',
    method: helperError,
  },
  {
    args: {args: {transactions: transaction}, helper: mineBlocks},
    description: 'Transactions to mine are an array',
    expected: 'ExpectedArrayOfTransactionsToMineBlocks',
    method: helperError,
  },
  {
    args: {args: {transactions: ['00']}, helper: mineBlocks},
    description: 'Transactions to mine are raw transactions',
    expected: 'ExpectedRawTransactionsToMineBlocks',
    method: helperError,
  },
  {
    args: {
      args: {
        lnd: makeLnd({chain: {blocks: [{transactions: [transaction]}]}}),
        transactions: [transaction],
      },
      helper: mineBlocks,
    },
    description: 'Transactions to mine are not in the chain already',
    expected: 'ExpectedUnconfirmedTransactionsToMineBlocks',
    method: helperError,
  },
  {
    args: {
      args: {transactions: [transaction, transaction]},
      helper: mineBlocks,
    },
    description: 'Transactions to mine are not repeated',
    expected: 'ExpectedUniqueTransactionsToMineBlocks',
    method: helperError,
  },
  {
    args: {
      args: {lnd: withPending(), transactions: [transaction, transaction]},
      helper: mineBlocks,
    },
    description: 'Transactions to mine are not repeated when in the mempool',
    expected: 'ExpectedUniqueTransactionsToMineBlocks',
    method: helperError,
  },
  {
    args: {
      args: {transactions: [transaction, conflicting]},
      helper: mineBlocks,
    },
    description: 'Transactions to mine do not spend the same output',
    expected: 'ExpectedNoConflictingTransactionsToMineBlocks',
    method: helperError,
  },
  {
    args: {
      args: {
        lnd: makeLnd({chain: {blocks: [{transactions: [transaction]}]}}),
        transactions: [conflicting],
      },
      helper: mineBlocks,
    },
    description: 'Mined transactions do not spend outputs spent in the chain',
    expected: 'ExpectedUnspentOutputsToMineBlocks',
    method: helperError,
  },
  {
    args: {
      args: {lnd: makeLnd({chain: {height: maxHeight}})},
      helper: mineBlocks,
    },
    description: 'Blocks are not mined past the height of the last block time',
    expected: 'ExpectedBlocksWithinMaxHeightToMineBlocks',
    method: helperError,
  },
  {
    args: {args: {lnd: {}}, helper: reorgChain},
    description: 'A chain is reorganized on a fake LND',
    expected: 'ExpectedFakeLndToReorgChain',
    method: helperError,
  },
  {
    args: {args: {height: -1}, helper: reorgChain},
    description: 'A reorg is from a height',
    expected: 'ExpectedHeightOfFirstReplacedBlockToReorgChain',
    method: helperError,
  },
  {
    args: {args: {height: 101}, helper: reorgChain},
    description: 'A reorg is from a block in the chain',
    expected: 'ExpectedHeightOfBlockInChainToReorgChain',
    method: helperError,
  },
  {
    args: {args: {blocks: {}, height: 100}, helper: reorgChain},
    description: 'Blocks of a reorg are an array',
    expected: 'ExpectedArrayOfBlocksToReorgChain',
    method: helperError,
  },
  {
    args: {args: {blocks: [null, null], height: 100}, helper: reorgChain},
    description: 'Blocks of a reorg are objects',
    expected: 'ExpectedBlockObjectsToReorgChain',
    method: helperError,
  },
  {
    args: {args: {blocks: [{}], height: 100}, helper: reorgChain},
    description: 'A reorg is to a chain with more blocks',
    expected: 'ExpectedMoreBlocksThanReplacedBlocksToReorgChain',
    method: helperError,
  },
  {
    args: {
      args: {blocks: [{}, {transactions: ['00']}], height: 100},
      helper: reorgChain,
    },
    description: 'Blocks of a reorg have raw transactions',
    expected: 'ExpectedRawTransactionsToReorgChain',
    method: helperError,
  },
  {
    args: {
      args: {blocks: [{}, {transactions: transaction}], height: 100},
      helper: reorgChain,
    },
    description: 'Blocks of a reorg have arrays of transactions',
    expected: 'ExpectedArrayOfTransactionsForBlockToReorgChain',
    method: helperError,
  },
  {
    args: {
      args: {
        blocks: [{transactions: [transaction]}, {transactions: [transaction]}],
        height: 100,
      },
      helper: reorgChain,
    },
    description: 'Transactions of a reorg are not repeated',
    expected: 'ExpectedUniqueTransactionsToReorgChain',
    method: helperError,
  },
  {
    args: {
      args: {
        blocks: [{transactions: [transaction]}, {}],
        height: 101,
        lnd: makeLnd({chain: {blocks: [mined, {}], height: 100}}),
      },
      helper: reorgChain,
    },
    description: 'Transactions of a reorg are not in the chain that is kept',
    expected: 'ExpectedUnconfirmedTransactionsToReorgChain',
    method: helperError,
  },
  {
    args: {
      args: {
        blocks: [{transactions: [transaction]}, {transactions: [conflicting]}],
        height: 100,
      },
      helper: reorgChain,
    },
    description: 'Transactions of a reorg do not spend the same output',
    expected: 'ExpectedNoConflictingTransactionsToReorgChain',
    method: helperError,
  },
  {
    args: {
      args: {
        blocks: [{transactions: [conflicting]}, {}],
        height: 101,
        lnd: makeLnd({chain: {blocks: [mined, {}], height: 100}}),
      },
      helper: reorgChain,
    },
    description: 'Transactions of a reorg do not spend outputs that are spent',
    expected: 'ExpectedUnspentOutputsToReorgChain',
    method: helperError,
  },
  {
    args: {
      args: {height: maxHeight, lnd: makeLnd({chain: {height: maxHeight}})},
      helper: reorgChain,
    },
    description: 'A reorg does not go past the height of the last block time',
    expected: 'ExpectedBlocksWithinMaxHeightToReorgChain',
    method: helperError,
  },
  {
    args: {count: 3},
    description: 'Blocks are mined with the transactions in the first block',
    expected: {heights: [101, 102, 103], is_mined: true, is_tip: true},
    method: minedBlocks,
  },
  {
    args: {},
    description: 'Replaced transactions go back to the mempool',
    expected: {
      heights: [101, 102],
      in_next_block: true,
      in_replaced_block: false,
    },
    method: reorgedTransaction,
  },
  {
    args: {blocks: [{transactions: [transaction]}, {}]},
    description: 'Transactions in new blocks stay out of the mempool',
    expected: {
      heights: [101, 102],
      in_next_block: false,
      in_replaced_block: true,
    },
    method: reorgedTransaction,
  },
  {
    args: {chain: {blocks: [{}, {}], height: 5}},
    description: 'Chains with the same blocks have the same block ids',
    expected: true,
    method: isSameTip,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, async () => {
    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
