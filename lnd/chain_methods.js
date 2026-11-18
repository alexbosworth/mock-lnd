const {forkHeight} = require('./../node');
const {makeRpcError} = require('./../data');
const makeStream = require('./make_stream');
const {updateChainStreams} = require('./../node');

const bufferAsHex = buffer => Buffer.from(buffer || []).toString('hex');
const isP2tr = script => /^5120[0-9a-f]{64}$/.test(script);
const isZero = buffer => !Buffer.from(buffer || []).some(byte => !!byte);
const maxConfs = 144;
const {min} = Math;
const {nextTick} = process;
const noHeightHint = 'a height hint greater than 0 must be provided';
const noScript = 'an output script must be provided';
const noTaprootOutpoint = 'cannot register witness v1 spend request without outpoint';
const outOfRangeConfs = 'number of confirmations must be between 1 and 144';

/** Make the methods of the chain notifier sub-server of a fake node

  {
    node: <Fake Node Object>
  }

  @returns
  {
    <Method Name String>: <RPC Method Function>
  }
*/
module.exports = ({node}) => {
  // Make a stream that fails, as a failed stream of LND fails
  const failedStream = details => {
    const stream = makeStream({});

    nextTick(() => stream.emit('error', makeRpcError({details})));

    return stream;
  };

  // Make a stream of a chain subscription of the node
  const subscribe = ({initial, request, type}) => {
    const stream = makeStream({});

    // The stream is not told about the chain until it is returned
    const subscription = {request, stream, type, is_waiting: true};

    node.chain.subscriptions.push(subscription);

    // The stream is told about the chain after it is returned
    nextTick(() => {
      subscription.is_waiting = false;

      return updateChainStreams({
        node,
        connected: initial(),
        subscriptions: [subscription],
      });
    });

    return stream;
  };

  return {
    registerBlockEpochNtfn: args => {
      const best = args || {};

      const [tip] = node.chain.blocks.slice(-1);

      // LND takes a best block with a height, ignoring a best block at 0
      const isBestKnown = !isZero(best.hash) && !!Number(best.height);

      // Without a best block, the cursor is the tip when the stream starts
      const cursor = (() => {
        // Exit early when there is no best block
        if (!isBestKnown) {
          return {hash: tip.hash, height: tip.height};
        }

        return {hash: Buffer.from(best.hash), height: Number(best.height)};
      })();

      return subscribe({
        // The cursor is found in the chain when the stream is told of blocks
        initial: () => {
          const fork = forkHeight({
            blocks: node.chain.blocks,
            hash: cursor.hash,
            stale: node.chain.stale,
          });

          // A best block that is not known is replayed from its height
          const isKnown = fork.height !== undefined;

          const height = isKnown ? fork.height : cursor.height;

          // Without a best block, the tip at the start is told of too
          const after = isBestKnown ? height : min(height, cursor.height - 1);

          return node.chain.blocks.filter(n => n.height > after);
        },
        request: best,
        type: 'blocks',
      });
    },
    registerConfirmationsNtfn: args => {
      const request = {
        height_hint: Number(args.height_hint) || Number(),
        include_block: !!args.include_block,
        num_confs: Number(args.num_confs) || Number(),
        script: Buffer.from(args.script || []),
        txid: Buffer.from(args.txid || []),
      };

      // Exit early when there is no output script
      if (!request.script.length) {
        return failedStream(noScript);
      }

      // Exit early when the confirmations are out of range
      if (!request.num_confs || request.num_confs > maxConfs) {
        return failedStream(outOfRangeConfs);
      }

      // Exit early when there is no height hint
      if (!request.height_hint) {
        return failedStream(noHeightHint);
      }

      return subscribe({request, initial: () => [], type: 'conf'});
    },
    registerSpendNtfn: args => {
      const outpoint = args.outpoint || {};

      const request = {
        height_hint: Number(args.height_hint) || Number(),
        outpoint: {
          hash: Buffer.from(outpoint.hash || []),
          index: outpoint.index || Number(),
        },
        script: Buffer.from(args.script || []),
      };

      // Exit early when there is no output script
      if (!request.script.length) {
        return failedStream(noScript);
      }

      // Exit early when there is no height hint
      if (!request.height_hint) {
        return failedStream(noHeightHint);
      }

      const isScriptSpend = isZero(request.outpoint.hash) && !outpoint.index;

      // Exit early when a taproot spend has no outpoint
      if (isScriptSpend && isP2tr(bufferAsHex(request.script))) {
        return failedStream(noTaprootOutpoint);
      }

      return subscribe({request, initial: () => [], type: 'spend'});
    },
  };
};
