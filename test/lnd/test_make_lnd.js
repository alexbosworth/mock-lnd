const {deepStrictEqual} = require('node:assert/strict');
const {rejects} = require('node:assert/strict');
const {test} = require('node:test');

const {makeLnd} = require('./../../');

const nextTick = () => new Promise(resolve => process.nextTick(resolve));
const peer = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const resolved = value => Promise.resolve(value);

// Get the forwards of a fake LND that is made without arguments
const defaultForwards = ({}) => {
  const lnd = makeLnd();

  return new Promise(resolve => {
    return lnd.default.forwardingHistory({index_offset: 0}, (err, res) => {
      return resolve(res.forwarding_events.length);
    });
  });
};

// Make calls to a fake LND and get what is recorded of the calls
const recordedCalls = ({}) => {
  const lnd = makeLnd({peers: [{public_key: peer}]});

  lnd.default.listPeers({}, () => {});
  lnd.default.sendOnionMessage({peer: Buffer.alloc(33)}, () => {});

  const stream = lnd.default.subscribeOnionMessages({});

  const [list, send, subscribe] = lnd.calls;

  return {
    list: [list.args, list.method, list.response.peers[0].pub_key, list.type],
    send: send.err.details,
    subscribe: subscribe.subscription === stream,
  };
};

// Add an invoice with a fake LND with a canceled stream of invoices and an
// active stream of invoices, and get the updates to the streams
const streamUpdates = async ({}) => {
  const lnd = makeLnd({});
  const updates = [];

  const canceled = lnd.default.subscribeInvoices({});

  const active = lnd.default.subscribeInvoices({});

  active.on('data', n => updates.push(['active', n.add_index]));
  canceled.on('data', n => updates.push(['canceled', n.add_index]));

  canceled.cancel();

  lnd.default.addInvoice({value: '1'}, () => {});

  await nextTick();

  return {updates, is_canceled: canceled.is_canceled};
};

// List channels with a fake LND that gives a channel with a capacity that is
// a number, when LND gives 64 bit numbers as strings
const listBadChannels = args => {
  const lnd = makeLnd({
    getChannels: ({}, cbk) => cbk(null, {channels: [{capacity: 1}]}),
    is_strict: args.is_strict,
  });

  return new Promise(resolve => {
    return lnd.default.listChannels({}, (err, res) => resolve(res));
  });
};

// Emit stream data with an onion that is not bytes on a fake LND stream
const emitBadOnion = args => {
  const lnd = makeLnd({is_strict: args.is_strict});

  const stream = lnd.default.subscribeOnionMessages({});

  return stream.emit('data', {onion: '00'});
};

// Call a method that fails after one call, and get the results and calls
const failingCalls = async ({code}) => {
  const lnd = makeLnd({
    failures: [{
      code,
      after: 1,
      details: 'details',
      method: 'getInfo',
      type: 'default',
    }],
  });

  const results = await [1, 2, 3].reduce(async previous => {
    const sum = await previous;

    const result = await new Promise(resolve => {
      return lnd.default.getInfo({}, (err, res) => {
        return resolve(!!err ? [err.code, err.details] : !!res);
      });
    });

    return sum.concat([result]);
  },
  resolved([]));

  return {results, recorded: lnd.calls.map(n => !!n.err)};
};

// Subscribe with a stream that fails, and get the error of the stream
const failingStream = ({}) => {
  const lnd = makeLnd({
    failures: [{
      details: 'details',
      method: 'subscribeInvoices',
      type: 'default',
    }],
  });

  const stream = lnd.default.subscribeInvoices({});

  return new Promise(resolve => stream.on('error', n => resolve(n.details)));
};

const tests = [
  {
    args: {chain: []},
    description: 'A chain is an object',
    error: 'ExpectedChainObjectToMakeLnd',
    method: makeLnd,
  },
  {
    args: {chain: {blocks: []}},
    description: 'A chain has blocks',
    error: 'ExpectedArrayOfBlocksForChainToMakeLnd',
    method: makeLnd,
  },
  {
    args: {chain: {blocks: [null]}},
    description: 'Blocks of a chain are objects',
    error: 'ExpectedBlockObjectsForChainToMakeLnd',
    method: makeLnd,
  },
  {
    args: {chain: {blocks: [{transactions: '00'}]}},
    description: 'Blocks have arrays of transactions',
    error: 'ExpectedArrayOfTransactionsForBlockToMakeLnd',
    method: makeLnd,
  },
  {
    args: {chain: {blocks: [{transactions: ['00']}]}},
    description: 'Blocks have raw transactions',
    error: 'ExpectedRawTransactionsForBlockToMakeLnd',
    method: makeLnd,
  },
  {
    args: {chain: {height: -1}},
    description: 'A chain starts at a height',
    error: 'ExpectedHeightOfFirstBlockForChainToMakeLnd',
    method: makeLnd,
  },
  {
    args: {chain: {fee_tokens_per_vbyte: 0}},
    description: 'A chain fee rate is a positive rate',
    error: 'ExpectedPositiveFeeRateForChainToMakeLnd',
    method: makeLnd,
  },
  {
    args: {chain: {blocks: [{}, {}], height: 5106601}},
    description: 'A chain ends before the height of the last block time',
    error: 'ExpectedBlocksWithinMaxHeightForChainToMakeLnd',
    method: makeLnd,
  },
  {
    args: {failures: {}},
    description: 'Failures are an array',
    error: 'ExpectedArrayOfFailuresToMakeLnd',
    method: makeLnd,
  },
  {
    args: {failures: [null]},
    description: 'Failures are objects',
    error: 'ExpectedFailureObjectsToMakeLnd',
    method: makeLnd,
  },
  {
    args: {failures: [{details: 'details'}]},
    description: 'Failures are of methods',
    error: 'ExpectedMethodAndTypeForFailureToMakeLnd',
    method: makeLnd,
  },
  {
    args: {failures: [{method: 'getInfo', type: 'default'}]},
    description: 'Failures have error details',
    error: 'ExpectedErrorDetailsForFailureToMakeLnd',
    method: makeLnd,
  },
  {
    args: {
      failures: [{after: -1, details: 'x', method: 'getInfo', type: 'wallet'}],
    },
    description: 'Failures are after a count of calls',
    error: 'ExpectedCountOfCallsAndCodeForFailureToMakeLnd',
    method: makeLnd,
  },
  {
    args: {failures: [{details: 'x', method: 'getInfo', type: 'wallet'}]},
    description: 'Failures are of methods of the fake LND',
    error: 'ExpectedKnownMethodForFailureToMakeLnd',
    method: makeLnd,
  },
  {
    args: {},
    description: 'A method fails after the calls that succeed',
    expected: {
      recorded: [false, true, true],
      results: [true, [2, 'details'], [2, 'details']],
    },
    method: failingCalls,
  },
  {
    args: {code: 14},
    description: 'A method fails with a gRPC code',
    expected: {
      recorded: [false, true, true],
      results: [true, [14, 'details'], [14, 'details']],
    },
    method: failingCalls,
  },
  {
    args: {},
    description: 'A stream fails with an error',
    expected: 'details',
    method: failingStream,
  },
  {
    args: {channels: {}},
    description: 'Channels are an array',
    error: 'ExpectedArrayOfChannelsToMakeLnd',
    method: makeLnd,
  },
  {
    args: {channels: [{partner_public_key: '00'}]},
    description: 'Channels have partner public keys',
    error: 'ExpectedPartnerPublicKeyForChannelToMakeLnd',
    method: makeLnd,
  },
  {
    args: {features: 38},
    description: 'Features are an array of bits',
    error: 'ExpectedArrayOfFeatureBitsToMakeLnd',
    method: makeLnd,
  },
  {
    args: {graph: {channels: [{id: '1x1x1', policies: [{public_key: peer}]}]}},
    description: 'Graph channels have two policies',
    error: 'ExpectedIdAndTwoPoliciesForGraphChannelToMakeLnd',
    method: makeLnd,
  },
  {
    args: {graph: {channels: [{id: '1x1x1'}]}},
    description: 'Graph channels have policies',
    error: 'ExpectedIdAndTwoPoliciesForGraphChannelToMakeLnd',
    method: makeLnd,
  },
  {
    args: {graph: {nodes: [{public_key: 'key'}]}},
    description: 'Graph nodes have public keys',
    error: 'ExpectedPublicKeyForGraphNodeToMakeLnd',
    method: makeLnd,
  },
  {
    args: {keys: {}},
    description: 'Keys are an array',
    error: 'ExpectedArrayOfKeysToMakeLnd',
    method: makeLnd,
  },
  {
    args: {keys: [{family: 1, index: 0, secret: '00'.repeat(32)}]},
    description: 'Keys have valid secrets',
    error: 'ExpectedLocatorAndPrivateKeyForKeyToMakeLnd',
    method: makeLnd,
  },
  {
    args: {keys: [{family: 1, secret: '01'.repeat(32)}]},
    description: 'Keys have key locators',
    error: 'ExpectedLocatorAndPrivateKeyForKeyToMakeLnd',
    method: makeLnd,
  },
  {
    args: {next_key_indexes: {}},
    description: 'Next key indexes are an array',
    error: 'ExpectedArrayOfNextKeyIndexesToMakeLnd',
    method: makeLnd,
  },
  {
    args: {next_key_indexes: [{family: 1, index: -1}]},
    description: 'Next key indexes have a family and index',
    error: 'ExpectedFamilyAndIndexForNextKeyIndexToMakeLnd',
    method: makeLnd,
  },
  {
    args: {network: 'network'},
    description: 'A network is a known network',
    error: 'ExpectedKnownNetworkNameToMakeLnd',
    method: makeLnd,
  },
  {
    args: {peers: {}},
    description: 'Peers are an array',
    error: 'ExpectedArrayOfPeersToMakeLnd',
    method: makeLnd,
  },
  {
    args: {peers: [{public_key: '00'}]},
    description: 'Peers have public keys',
    error: 'ExpectedPublicKeyForPeerToMakeLnd',
    method: makeLnd,
  },
  {
    args: {routes: {}},
    description: 'Routes are an array',
    error: 'ExpectedArrayOfRoutesToMakeLnd',
    method: makeLnd,
  },
  {
    args: {routes: [{hops: [{public_key: 'key'}]}]},
    description: 'Routes have hops with public keys',
    error: 'ExpectedValidHopsForRouteToMakeLnd',
    method: makeLnd,
  },
  {
    args: {secret: 'ff'.repeat(32)},
    description: 'A secret is a valid private key',
    error: 'ExpectedValidNodeSecretToMakeLnd',
    method: makeLnd,
  },
  {
    args: {},
    description: 'A fake LND can be made without arguments',
    expected: 1,
    method: defaultForwards,
  },
  {
    args: {},
    description: 'Calls are recorded with their responses',
    expected: {
      list: [{}, 'listPeers', peer, 'default'],
      send: 'peer is not connected',
      subscribe: true,
    },
    method: recordedCalls,
  },
  {
    args: {},
    description: 'Canceled invoice streams are not updated',
    expected: {is_canceled: true, updates: [['active', '1']]},
    method: streamUpdates,
  },
  {
    args: {is_strict: true},
    description: 'Strict mode checks responses against the LND protos',
    error: 'UnexpectedLndResponse ' +
      'default.listChannels.channels[0].capacity: expected int64 as string',
    method: listBadChannels,
  },
  {
    args: {is_strict: false},
    description: 'Responses are not checked without strict mode',
    expected: {channels: [{capacity: 1}]},
    method: listBadChannels,
  },
  {
    args: {is_strict: true},
    description: 'Strict mode checks stream data against the LND protos',
    error: 'UnexpectedLndResponse ' +
      'default.subscribeOnionMessages.onion: expected bytes as Buffer',
    method: emitBadOnion,
  },
  {
    args: {is_strict: false},
    description: 'Stream data is not checked without strict mode',
    expected: false,
    method: emitBadOnion,
  },
];

tests.forEach(({args, description, error, expected, method}) => {
  test(description, async () => {
    if (!!error) {
      const failing = async () => method(args);

      return await rejects(failing, new Error(error), 'Got expected error');
    }

    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
