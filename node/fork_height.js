const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const previousHashEnd = 36;
const previousHashStart = 4;

/** Find the height of the last block in the chain that a block builds on

  A block in the chain builds on itself. A stale block that a reorg took out
  of the chain builds on the block in the chain where the chains fork. A
  stale block that builds on no known block forks below the first block.

  Blocks are walked back one at a time, so a fork of any depth is found.

  {
    blocks: [{
      hash: <Block Hash Buffer Object>
      header: <Raw Block Header Buffer Object>
      height: <Block Height Number>
    }]
    hash: <Block Hash Buffer Object>
    stale: [<Stale Block Object>]
  }

  @returns
  {
    [height]: <Height of the Block in the Chain Number>
  }
*/
module.exports = ({blocks, hash, stale}) => {
  const inChain = new Set(blocks);

  // Known blocks by their hashes, including blocks that a reorg took out
  const known = new Map(blocks.concat(stale).map(n => {
    return [bufferAsHex(n.hash), n];
  }));

  let block = known.get(bufferAsHex(hash));

  // Exit early when the block is not known
  if (!block) {
    return {};
  }

  // A stale block builds on the block with the hash in its header
  while (!inChain.has(block)) {
    const previous = block.header.subarray(previousHashStart, previousHashEnd);

    const before = known.get(bufferAsHex(previous));

    // Exit early when the block builds on no known block
    if (!before) {
      return {height: block.height - 1};
    }

    block = before;
  }

  return {height: block.height};
};
