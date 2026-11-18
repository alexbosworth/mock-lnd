const makeBlock = require('./make_block');

const defaultFeeRate = 1;
const defaultHeight = 1;
const noPreviousBlock = Buffer.alloc(32);

/** Make the chain of a fake node

  {
    [blocks]: [{
      [transactions]: [<Raw Transaction Hex String>]
    }]
    [fee_tokens_per_vbyte]: <Chain Fee Tokens Per Virtual Byte Number>
    [height]: <Height of the First Block Number>
  }

  @returns
  {
    blocks: [<Block Object>]
    fee_tokens_per_vbyte: <Chain Fee Tokens Per Virtual Byte Number>
    made: <Count of Blocks Made Number>
    mempool: [<Raw Transaction Hex String>]
    stale: [<Block Object>]
    subscriptions: [{
      is_waiting: <Stream Is Not Told About the Chain Yet Bool>
      request: <RPC Arguments Object>
      [sent]: <Id of Block of Last Update Hex String>
      stream: <Stream EventEmitter Object>
      type: <Subscription Type String>
    }]
    updates: [<Waiting Chain Update Object>]
  }
*/
module.exports = args => {
  const start = args.height === undefined ? defaultHeight : args.height;

  // Each block builds on the block before it
  const blocks = (args.blocks || [{}]).reduce((chain, block, i) => {
    const [last] = chain.slice(-1);

    return chain.concat(makeBlock({
      height: start + i,
      nonce: i,
      previous: !last ? noPreviousBlock : last.hash,
      transactions: block.transactions || [],
    }));
  },
  []);

  return {
    blocks,
    fee_tokens_per_vbyte: args.fee_tokens_per_vbyte || defaultFeeRate,
    made: blocks.length,
    mempool: [],
    stale: [],
    subscriptions: [],
    updates: [],
  };
};
