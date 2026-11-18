const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {broadcastChainTransaction} = require('lightning');
const {getBlock} = require('lightning');
const {getBlockHeader} = require('lightning');
const {getChainFeeRate} = require('lightning');
const {getWalletInfo} = require('lightning');
const {idForBlock} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {previousBlockId} = require('@alexbosworth/blockchain');
const {subscribeToBlocks} = require('lightning');
const {subscribeToChainAddress} = require('lightning');
const {subscribeToChainSpend} = require('lightning');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {makeLnd} = require('./../../');
const {mineBlocks} = require('./../../');
const {reorgChain} = require('./../../');

const all = promises => Promise.all(promises);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const nextTick = () => new Promise(resolve => setImmediate(resolve));
const resolved = value => Promise.resolve(value);
const script = `0020${'55'.repeat(32)}`;
const strict = chain => makeLnd({chain, is_strict: true});

// A transaction that pays to the script
const funding = transactionFromComponents({
  inputs: [{id: '11'.repeat(32), script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script, tokens: 1000}],
  version: 2,
}).transaction;

// The id of the transaction that pays to the script
const fundingId = idForTransaction({transaction: funding}).id;

// A transaction that spends the output that pays to the script
const spend = transactionFromComponents({
  inputs: [{id: fundingId, script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: '51', tokens: 900}],
  version: 2,
}).transaction;

// Another transaction that spends the output that pays to the script
const otherSpend = transactionFromComponents({
  inputs: [{id: fundingId, script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: '51', tokens: 800}],
  version: 2,
}).transaction;

// A transaction that spends the output of the spend
const child = transactionFromComponents({
  inputs: [{
    id: idForTransaction({transaction: spend}).id,
    script: '',
    sequence: 0,
    vout: 0,
  }],
  locktime: 0,
  outputs: [{script: '51', tokens: 800}],
  version: 2,
}).transaction;

// Get the blocks of a chain, and check that they build on each other
const chainOf = async ({chain}) => {
  const lnd = strict(chain);

  const info = await getWalletInfo({lnd});

  const heights = [100, 101, 102];

  const blocks = await all(heights.map(height => {
    return getBlock({height, lnd});
  }));

  const headers = await all(heights.map(height => {
    return getBlockHeader({height, lnd});
  }));

  const ids = headers.map(({header}) => idForBlock({block: header}).id);

  const tip = await getBlock({lnd});

  return {
    builds_on_previous: blocks.slice(1).every((n, i) => {
      return previousBlockId({block: n.block}).previous === ids[i];
    }),
    funding_height: blocks.findIndex(n => n.block.includes(funding)) + 100,
    height: info.current_block_height,
    is_tip: idForBlock({block: tip.block}).id === info.current_block_hash,
  };
};

// Get a block and get the error
const blockError = async args => {
  try {
    return await getBlock({...args, lnd: makeLnd({})});
  } catch (err) {
    const [code, message, details] = err;

    return [code, message, !details ? undefined : details.err.details];
  }
};

// Ask for a block or a header by a hash, and get the error details
const hashError = ({hash, method}) => new Promise(resolve => {
  return makeLnd({}).blocks[method]({block_hash: hash}, err => {
    return resolve(err.details);
  });
});

// Get the chain fee rate of a fake LND with a chain fee rate
const feeRate = async ({chain}) => {
  return (await getChainFeeRate({lnd: strict(chain)})).tokens_per_vbyte;
};

// Get the heights of blocks told about while mining and reorganizing
const blockEvents = async ({}) => {
  const lnd = strict({height: 100});
  const events = [];

  const sub = subscribeToBlocks({lnd});

  sub.on('block', n => events.push(n.height));

  await nextTick();

  mineBlocks({lnd, count: 2});

  reorgChain({lnd, height: 102});

  sub.removeAllListeners();

  return events;
};

// Get the confirmations of the funding while mining and reorganizing
const confirmationEvents = async ({confirmations}) => {
  const lnd = strict({height: 100});
  const events = [];

  const sub = subscribeToChainAddress({
    lnd,
    min_confirmations: confirmations,
    min_height: 100,
    output_script: script,
  });

  sub.on('confirmation', n => events.push(['confirmation', n.height]));
  sub.on('reorg', () => events.push(['reorg']));

  await nextTick();

  await broadcastChainTransaction({lnd, transaction: funding});

  mineBlocks({lnd});
  mineBlocks({lnd});

  reorgChain({lnd, height: 101});

  mineBlocks({lnd});

  sub.removeAllListeners();

  return events;
};

// Get the spends of the funding output while mining and reorganizing
const spendEvents = async ({}) => {
  const lnd = strict({blocks: [{transactions: [funding]}], height: 100});
  const events = [];

  const sub = subscribeToChainSpend({
    lnd,
    min_height: 100,
    output_script: script,
    transaction_id: fundingId,
    transaction_vout: 0,
  });

  sub.on('confirmation', n => events.push(['spend', n.height, n.vin]));
  sub.on('reorg', () => events.push(['reorg']));

  await nextTick();

  mineBlocks({lnd, transactions: [spend]});

  reorgChain({lnd, height: 101, blocks: [{}, {transactions: [spend]}]});

  sub.removeAllListeners();

  return events;
};

// Publish transactions, mine a block, and get what is in the block
const publishedTransactions = async ({transactions}) => {
  const lnd = strict({blocks: [{transactions: [funding]}], height: 100});

  const errors = [];

  await transactions.reduce(async (previous, transaction) => {
    await previous;

    try {
      await broadcastChainTransaction({lnd, transaction});
    } catch (err) {
      errors.push(err[2].err.details);
    }
  },
  resolved());

  mineBlocks({lnd});

  const {block} = await getBlock({lnd});

  return {errors, mined: [spend, otherSpend].map(n => block.includes(n))};
};

// Subscribe to the chain with a request that LND rejects, and get the error
const streamError = async ({method, request}) => {
  const lnd = makeLnd({});

  const stream = lnd.chain[method](request);

  return new Promise(resolve => stream.on('error', n => resolve(n.details)));
};

// Change the bytes of responses, and check the chain is not changed
const changedResponses = async ({}) => {
  const lnd = strict({height: 100});
  const tips = [];

  // Responses are changed after they are given
  [1, 2].forEach(() => {
    return lnd.blocks.getBestBlock({}, (err, res) => {
      tips.push(Buffer.from(res.block_hash));

      return res.block_hash.reverse();
    });
  });

  const tip = (await getWalletInfo({lnd})).current_block_hash;

  // Blocks subscriptions change the bytes of block hashes as they get them
  const sub = subscribeToBlocks({lnd});

  sub.on('block', () => {});

  await nextTick();

  sub.removeAllListeners();

  const [mined] = mineBlocks({lnd}).blocks;

  const {block} = await getBlock({lnd, id: mined.id});

  return {
    is_on_tip: previousBlockId({block}).previous === tip,
    is_same_tip: tips[0].equals(tips[1]),
  };
};

// Get the hash of the block at a height
const hashAt = ({height, lnd}) => new Promise(resolve => {
  return lnd.blocks.getBlockHash({block_height: height}, (err, res) => {
    return resolve(res.block_hash);
  });
});

// Subscribe to blocks after a best block, and get the heights told of
const blocksAfter = async args => {
  const events = [];
  const {height} = args;
  const lnd = strict(args.chain || {blocks: [{}, {}, {}], height: 100});

  const hash = await hashAt({height, lnd});

  // The chain is reorganized before the subscription starts
  if (args.reorg_before !== undefined) {
    reorgChain({lnd, height: args.reorg_before});
  }

  const sub = lnd.chain.registerBlockEpochNtfn({hash, height});

  sub.on('data', n => events.push(n.height));

  // The chain is reorganized before the subscription is told of the chain
  if (args.reorg_after !== undefined) {
    reorgChain({lnd, height: args.reorg_after});
  }

  // A block is mined before the subscription is told about the chain
  if (!!args.is_mined) {
    mineBlocks({lnd});
  }

  await nextTick();

  return events;
};

// Subscribe to blocks, mine from a listener, and get the heights told of
const blocksFromListener = async args => {
  const events = [];
  const lnd = strict({height: 100});

  const sub = lnd.chain.registerBlockEpochNtfn({});

  sub.on('data', n => {
    events.push(n.height);

    // Exit early when the listener does not act on this block
    if (n.height !== 101) {
      return;
    }

    // The stream is canceled from the listener
    if (!!args.is_canceled) {
      return sub.cancel();
    }

    return mineBlocks({lnd});
  });

  await nextTick();

  mineBlocks({lnd, count: 2});

  return events;
};

// Mine from a block listener, and get the blocks a second listener is told of
const secondListener = async ({}) => {
  const events = [];
  const lnd = strict({height: 100});

  const first = lnd.chain.registerBlockEpochNtfn({});
  const second = lnd.chain.registerBlockEpochNtfn({});

  // A block is mined after the first listener is told of block 101
  first.on('data', n => {
    // Exit early when the block is not block 101
    if (n.height !== 101) {
      return;
    }

    return mineBlocks({lnd});
  });

  second.on('data', n => events.push(n.height));

  await nextTick();

  mineBlocks({lnd, count: 2});

  return events;
};

// Mine a confirmation from a block listener, and get the confirmation events
const listenerConfirmation = async ({}) => {
  const events = [];
  const lnd = strict({height: 100});

  const blocks = lnd.chain.registerBlockEpochNtfn({});

  const confs = lnd.chain.registerConfirmationsNtfn({
    height_hint: 100,
    num_confs: 1,
    script: hexAsBuffer(script),
  });

  // The funding is mined after the blocks listener is told of block 101
  blocks.on('data', n => {
    // Exit early when the block is not block 101
    if (n.height !== 101) {
      return;
    }

    return mineBlocks({lnd, transactions: [funding]});
  });

  confs.on('data', n => {
    const height = !n.conf ? null : n.conf.block_height;

    return events.push([n.event, height]);
  });

  await nextTick();

  mineBlocks({lnd, count: 2});

  return events;
};

// Reorg from a confirmation listener, and get what two conf streams are told
const reorgFromConfirmation = async ({}) => {
  const lnd = strict({height: 100});

  const request = {
    height_hint: 100,
    num_confs: 1,
    script: hexAsBuffer(script),
  };

  const streams = [1, 2].map(() => {
    return lnd.chain.registerConfirmationsNtfn(request);
  });

  const events = streams.map(() => []);

  streams.forEach((stream, i) => stream.on('data', n => {
    const height = !n.conf ? null : n.conf.block_height;

    return events[i].push([n.event, height]);
  }));

  // The first stream reorganizes the chain when it is told of the funding
  streams[0].on('data', n => {
    // Exit early when the data is not a confirmation
    if (n.event !== 'conf') {
      return;
    }

    return reorgChain({lnd, height: n.conf.block_height});
  });

  await nextTick();

  await broadcastChainTransaction({lnd, transaction: funding});

  mineBlocks({lnd});

  return events;
};

// Mine many blocks with a stream, and get the count and last height told of
const manyBlocks = async ({count}) => {
  const heights = [];
  const lnd = makeLnd({});

  const sub = lnd.chain.registerBlockEpochNtfn({});

  sub.on('data', n => heights.push(n.height));

  await nextTick();

  mineBlocks({count, lnd});

  return {count: heights.length, last: heights.slice(-1).pop()};
};

// Replay a deep reorg to a stream from a stale best block, and get the heights
const deepReplay = async ({count}) => {
  const heights = [];
  const lnd = makeLnd({});

  const [stale] = mineBlocks({count, lnd}).blocks.slice(-1);

  reorgChain({lnd, height: 2});

  const sub = lnd.chain.registerBlockEpochNtfn({
    hash: hexAsBuffer(stale.id).reverse(),
    height: stale.height,
  });

  sub.on('data', n => heights.push(n.height));

  await nextTick();

  return {count: heights.length, first: heights[0]};
};

// Replace a spend that has a child in the mempool, and get what is mined
const replacedChild = async ({}) => {
  const lnd = strict({blocks: [{transactions: [funding]}], height: 100});

  await broadcastChainTransaction({lnd, transaction: spend});
  await broadcastChainTransaction({lnd, transaction: child});
  await broadcastChainTransaction({lnd, transaction: otherSpend});

  mineBlocks({lnd});

  const {block} = await getBlock({lnd});

  return [spend, child, otherSpend].map(n => block.includes(n));
};

// Reorg out a spend that has a child in the mempool, and get what is mined
const reorgedChild = async ({}) => {
  const lnd = strict({blocks: [{transactions: [funding]}], height: 100});

  mineBlocks({lnd, transactions: [spend]});

  await broadcastChainTransaction({lnd, transaction: child});

  reorgChain({lnd, blocks: [{transactions: [otherSpend]}, {}], height: 101});

  mineBlocks({lnd});

  const {block} = await getBlock({lnd});

  return [spend, child, otherSpend].map(n => block.includes(n));
};

// Get the height of the chain tip from getInfo and from getBestBlock
const tipHeights = async ({chain}) => {
  const lnd = strict(chain);

  const info = await getWalletInfo({lnd});

  const best = await new Promise(resolve => {
    return lnd.blocks.getBestBlock({}, (err, res) => resolve(res));
  });

  return [info.current_block_height, best.block_height];
};

// Reorganize the chain, and check a replaced block can still be gotten
const staleBlock = async ({}) => {
  const lnd = strict({height: 100});

  const [replaced] = mineBlocks({lnd}).blocks;

  reorgChain({lnd, height: replaced.height});

  const {block} = await getBlock({lnd, id: replaced.id});

  const info = await getWalletInfo({lnd});

  return {
    is_stale: info.current_block_hash !== replaced.id,
    is_stale_block: idForBlock({block}).id === replaced.id,
  };
};

const tests = [
  {
    args: {chain: {blocks: [{transactions: [funding]}, {}, {}], height: 100}},
    description: 'A chain is blocks that build on each other',
    expected: {
      builds_on_previous: true,
      funding_height: 100,
      height: 102,
      is_tip: true,
    },
    method: chainOf,
  },
  {
    args: {height: 2},
    description: 'A block is expected to be in the chain',
    expected: [
      503,
      'UnexpectedErrorGettingBlockHash',
      '-8: Block height out of range',
    ],
    method: blockError,
  },
  {
    args: {id: '00'.repeat(32)},
    description: 'A block is expected to be known',
    expected: [404, 'BlockNotFound', undefined],
    method: blockError,
  },
  {
    args: {hash: Buffer.alloc(31), method: 'getBlock'},
    description: 'A block hash of another size is not found',
    expected: '-5: Block not found',
    method: hashError,
  },
  {
    args: {hash: Buffer.alloc(31), method: 'getBlockHeader'},
    description: 'A header hash of another size is not found',
    expected: '-5: Block not found',
    method: hashError,
  },
  {
    args: {chain: {fee_tokens_per_vbyte: 5}},
    description: 'The chain fee rate is the rate of the chain',
    expected: 5,
    method: feeRate,
  },
  {
    args: {chain: {}},
    description: 'The chain fee rate is LND\'s floor of 253 per kw by default',
    expected: 1.012,
    method: feeRate,
  },
  {
    args: {chain: {fee_tokens_per_vbyte: 0.5}},
    description: 'A chain fee rate below LND\'s floor is raised to the floor',
    expected: 1.012,
    method: feeRate,
  },
  {
    args: {},
    description: 'Streams of blocks are told of the tip and of new blocks',
    expected: [100, 101, 102, 102, 103],
    method: blockEvents,
  },
  {
    args: {confirmations: 1},
    description: 'A confirmation is told about, then a reorg of it',
    expected: [['confirmation', 101], ['reorg'], ['confirmation', 104]],
    method: confirmationEvents,
  },
  {
    args: {confirmations: 2},
    description: 'A confirmation is told about once it is deep enough',
    expected: [['confirmation', 101], ['reorg']],
    method: confirmationEvents,
  },
  {
    args: {},
    description: 'A spend is told about, then a reorg of it',
    expected: [['spend', 101, 0], ['reorg'], ['spend', 102, 0]],
    method: spendEvents,
  },
  {
    args: {transactions: [spend]},
    description: 'A published transaction is mined in the next block',
    expected: {errors: [], mined: [true, false]},
    method: publishedTransactions,
  },
  {
    args: {transactions: [spend, otherSpend]},
    description: 'A transaction replaces a transaction that it conflicts with',
    expected: {errors: [], mined: [false, true]},
    method: publishedTransactions,
  },
  {
    args: {transactions: [spend, spend, funding]},
    description: 'A transaction in the mempool or the chain is published',
    expected: {errors: [], mined: [true, false]},
    method: publishedTransactions,
  },
  {
    args: {
      method: 'registerConfirmationsNtfn',
      request: {height_hint: 1, num_confs: 145, script: Buffer.alloc(1)},
    },
    description: 'Confirmations are a count of confirmations',
    expected: 'number of confirmations must be between 1 and 144',
    method: streamError,
  },
  {
    args: {
      method: 'registerSpendNtfn',
      request: {script: Buffer.alloc(1)},
    },
    description: 'A spend is watched for from a height',
    expected: 'a height hint greater than 0 must be provided',
    method: streamError,
  },
  {
    args: {
      method: 'registerSpendNtfn',
      request: {height_hint: 1, script: hexAsBuffer(`5120${'00'.repeat(32)}`)},
    },
    description: 'A taproot spend is watched for with an outpoint',
    expected: 'cannot register witness v1 spend request without outpoint',
    method: streamError,
  },
  {
    args: {},
    description: 'Changing the bytes of a response does not change the node',
    expected: {is_on_tip: true, is_same_tip: true},
    method: changedResponses,
  },
  {
    args: {},
    description: 'A block that is replaced can be gotten by its id',
    expected: {is_stale: true, is_stale_block: true},
    method: staleBlock,
  },
  {
    args: {height: 100, is_mined: true},
    description: 'Blocks after a best block are told of before new blocks',
    expected: [101, 102, 103],
    method: blocksAfter,
  },
  {
    args: {height: 102, reorg_before: 102},
    description: 'A best block that a reorg took out replays from the fork',
    expected: [102, 103],
    method: blocksAfter,
  },
  {
    args: {height: 102, reorg_after: 102},
    description: 'A best block taken out before blocks are told of replays',
    expected: [102, 103],
    method: blocksAfter,
  },
  {
    args: {height: 100, reorg_before: 100},
    description: 'A first block that is replaced replays from the new first',
    expected: [100, 101, 102, 103],
    method: blocksAfter,
  },
  {
    args: {chain: {blocks: [{}, {}, {}], height: 0}, height: 0},
    description: 'A best block at height 0 is ignored, as LND ignores it',
    expected: [2],
    method: blocksAfter,
  },
  {
    args: {},
    description: 'Blocks mined by a listener come after blocks before them',
    expected: [100, 101, 102, 103],
    method: blocksFromListener,
  },
  {
    args: {is_canceled: true},
    description: 'A stream canceled by a listener is told of no more blocks',
    expected: [100, 101],
    method: blocksFromListener,
  },
  {
    args: {},
    description: 'Blocks mined by a listener come after blocks in each stream',
    expected: [100, 101, 102, 103],
    method: secondListener,
  },
  {
    args: {},
    description: 'A block mined by a listener is not a reorg to other streams',
    expected: [['conf', 103]],
    method: listenerConfirmation,
  },
  {
    args: {},
    description: 'Streams are told of an update as the chain was when made',
    expected: [
      [['conf', 101], ['reorg', null]],
      [['conf', 101], ['reorg', null]],
    ],
    method: reorgFromConfirmation,
  },
  {
    args: {count: 15000},
    description: 'Many blocks are told of to a stream',
    expected: {count: 15001, last: 15001},
    method: manyBlocks,
  },
  {
    args: {count: 12000},
    description: 'A deep reorg is replayed from a stale best block',
    expected: {count: 12001, first: 2},
    method: deepReplay,
  },
  {
    args: {},
    description: 'A replaced transaction takes its children from the mempool',
    expected: [false, false, true],
    method: replacedChild,
  },
  {
    args: {},
    description: 'A conflict from a reorg takes children out of the mempool',
    expected: [false, false, false],
    method: reorgedChild,
  },
  {
    args: {chain: {height: 0}},
    description: 'A chain can start at height 0',
    expected: [0, 0],
    method: tipHeights,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, async () => {
    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
