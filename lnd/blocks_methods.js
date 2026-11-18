const {makeRpcError} = require('./../data');

const blockNotFound = '-5: Block not found';
const heightOutOfRange = '-8: Block height out of range';

/** Make the methods of the chain kit sub-server of a fake node

  {
    node: <Fake Node Object>
  }

  @returns
  {
    <Method Name String>: <RPC Method Function>
  }
*/
module.exports = ({node}) => {
  // Get a block of the chain or a stale block by its hash
  const blockFor = (hash, cbk) => {
    const hashBytes = Buffer.from(hash || []);

    // A chain backend keeps blocks that a reorg took out of the chain
    const blocks = node.chain.blocks.concat(node.chain.stale);

    const block = blocks.find(n => n.hash.equals(hashBytes));

    // Exit early when no block has the hash, as for a hash of another size
    if (!block) {
      return cbk(makeRpcError({details: blockNotFound}));
    }

    return cbk(null, block);
  };

  return {
    getBestBlock: ({}, cbk) => {
      const [tip] = node.chain.blocks.slice(-1);

      // Bytes are copied, as gRPC gives new bytes for every response
      return cbk(null, {
        block_hash: Buffer.from(tip.hash),
        block_height: tip.height,
      });
    },
    getBlock: (args, cbk) => {
      return blockFor(args.block_hash, (err, block) => {
        // Exit early when there is no block
        if (!!err) {
          return cbk(err);
        }

        return cbk(null, {raw_block: Buffer.from(block.block)});
      });
    },
    getBlockHash: (args, cbk) => {
      const height = Number(args.block_height);

      const block = node.chain.blocks.find(n => n.height === height);

      // Exit early when there is no block at the height in the chain
      if (!block) {
        return cbk(makeRpcError({details: heightOutOfRange}));
      }

      return cbk(null, {block_hash: Buffer.from(block.hash)});
    },
    getBlockHeader: (args, cbk) => {
      return blockFor(args.block_hash, (err, block) => {
        // Exit early when there is no block
        if (!!err) {
          return cbk(err);
        }

        return cbk(null, {raw_block_header: Buffer.from(block.header)});
      });
    },
  };
};
