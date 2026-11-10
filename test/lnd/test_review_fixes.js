const {deepStrictEqual} = require('node:assert/strict');
const {rejects} = require('node:assert/strict');
const {test} = require('node:test');

const {createInvoice} = require('lightning');
const {getChannel} = require('lightning');
const {getNode} = require('lightning');
const {getPeers} = require('lightning');
const {getRouteToDestination} = require('lightning');
const {getUtxos} = require('lightning');
const {payViaPaymentRequest} = require('lightning');
const {subscribeToInvoices} = require('lightning');

const {makeLnd} = require('./../../');
const {payInvoice} = require('./../../');

const badLocator = {key_family: -1, key_index: 0};
const identityLocator = {key_family: 6, key_index: 0};
const message = Buffer.from('message');
const nextTick = () => new Promise(resolve => setImmediate(resolve));
const other = '02531fe6068134503d2723133227c867ac8fa6c83c537e9a44c3c5bdbdcb1fe337';
const peer = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';

// Call a method of a sub-server of a fake LND and get its error details
const errorOf = args => {
  const lnd = makeLnd({});

  return new Promise(resolve => {
    return lnd[args.type][args.method](args.request, err => {
      return resolve(!err ? null : err.details);
    });
  });
};

// Call a method of a fake LND sub-server with a callback that throws, and get
// the calls of the callback and the error that is thrown
const throwingCallback = args => {
  const calls = [];
  const lnd = makeLnd({});

  try {
    lnd[args.type][args.method](args.request, err => {
      calls.push(!!err ? err.details : null);

      throw new Error('CallbackFailed');
    });
  } catch (err) {
    return {calls, thrown: err.message};
  }

  return {calls};
};

// Create an invoice for a preimage, and then another for the same preimage
const createTwice = async ({secret}) => {
  const lnd = makeLnd({});

  await createInvoice({lnd, secret, tokens: 1});

  return await createInvoice({lnd, secret, tokens: 1}).catch(err => ({err}));
};

// Make a fake LND with uppercase public keys, and get the keys it gives
const givenKeys = async ({}) => {
  const upper = peer.toUpperCase();

  const lnd = makeLnd({
    channels: [{partner_public_key: upper}],
    graph: {
      channels: [{
        id: '1x1x1',
        policies: [{public_key: upper}, {public_key: other.toUpperCase()}],
      }],
      nodes: [{public_key: upper}],
    },
    peers: [{public_key: upper}],
    routes: [{hops: [{public_key: upper}]}],
  });

  const {peers} = await getPeers({lnd});

  const node = await getNode({
    lnd,
    is_omitting_channels: true,
    public_key: peer,
  });

  const byUppercase = await getNode({
    lnd,
    is_omitting_channels: true,
    public_key: upper,
  });

  const channel = await getChannel({lnd, id: '1x1x1'});

  const {route} = await getRouteToDestination({
    lnd,
    destination: upper,
    tokens: 1,
  });

  return {
    node: node.features,
    node_by_uppercase: byUppercase.features,
    peers: peers.map(n => n.public_key),
    policies: channel.policies.map(n => n.public_key),
    route: route.hops.map(n => n.public_key),
  };
};

// Create an invoice, clear the record of calls, pay the invoice, and get the
// updates that a stream of invoices got
const updatesAfterClear = async ({}) => {
  const lnd = makeLnd({});
  const updates = [];

  const sub = subscribeToInvoices({lnd});

  sub.on('invoice_updated', n => updates.push(n.is_confirmed));

  const {id} = await createInvoice({lnd, tokens: 1});

  await nextTick();

  // Tests can clear the log of calls to count the calls that come after
  lnd.calls.splice(0);

  payInvoice({id, lnd});

  sub.removeAllListeners();

  return updates;
};

// Get UTXOs with a fake LND with an override of UTXOs that fails
const failedUtxos = async ({}) => {
  const lnd = makeLnd({getUtxos: ({}, cbk) => cbk({details: 'failed'})});

  return await getUtxos({lnd}).catch(err => ({err}));
};

// Cancel a payment stream of a fake LND, and then make a payment
const payAfterCancel = async ({}) => {
  const lnd = makeLnd({});

  const stream = lnd.router.sendPaymentV2({});

  stream.cancel();

  const {request} = await createInvoice({lnd, tokens: 1});

  const paid = await payViaPaymentRequest({lnd, request});

  return {is_canceled: stream.is_canceled, secret_length: paid.secret.length};
};

const tests = [
  {
    args: {method: 'addInvoice', request: {value: '1'}, type: 'default'},
    description: 'A callback that throws is not called again with an error',
    expected: {calls: [null], thrown: 'CallbackFailed'},
    method: throwingCallback,
  },
  {
    args: {
      method: 'deriveSharedKey',
      request: {ephemeral_pubkey: Buffer.from(peer, 'hex')},
      type: 'signer',
    },
    description: 'Deriving a shared key calls back once',
    expected: {calls: [null], thrown: 'CallbackFailed'},
    method: throwingCallback,
  },
  {
    args: {
      method: 'signMessage',
      request: {key_loc: identityLocator, msg: message},
      type: 'signer',
    },
    description: 'Signing a message calls back once',
    expected: {calls: [null], thrown: 'CallbackFailed'},
    method: throwingCallback,
  },
  {
    args: {secret: '01'.repeat(32)},
    description: 'An invoice with a payment hash that exists is rejected',
    expected: {err: [409, 'InvoiceWithGivenHashAlreadyExists']},
    method: createTwice,
  },
  {
    args: {
      method: 'addInvoice',
      request: {value: '1', value_msat: '1000'},
      type: 'default',
    },
    description: 'An invoice amount is given in tokens or millitokens',
    expected: 'sat and msat arguments are mutually exclusive',
    method: errorOf,
  },
  {
    args: {},
    description: 'Public keys are lowercase, as LND has them',
    expected: {
      node: [],
      node_by_uppercase: [],
      peers: [peer],
      policies: [peer, other],
      route: [peer],
    },
    method: givenKeys,
  },
  {
    args: {},
    description: 'Invoice subscriptions are updated after calls are cleared',
    expected: [false, true],
    method: updatesAfterClear,
  },
  {
    args: {},
    description: 'A failing UTXOs override fails getting UTXOs',
    expected: {
      err: [
        503,
        'UnexpectedErrorGettingUnspentTxOutputs',
        {err: {details: 'failed'}},
      ],
    },
    method: failedUtxos,
  },
  {
    args: {},
    description: 'A payment stream can be canceled like a gRPC stream',
    expected: {is_canceled: true, secret_length: 64},
    method: payAfterCancel,
  },
  {
    args: {method: 'deriveKey', request: badLocator, type: 'wallet'},
    description: 'A key is not derived at a key locator out of range',
    expected: 'invalid key locator',
    method: errorOf,
  },
  {
    args: {
      method: 'deriveNextKey',
      request: {key_family: 2 ** 31},
      type: 'wallet',
    },
    description: 'A next key is not derived in a key family out of range',
    expected: 'invalid key locator',
    method: errorOf,
  },
  {
    args: {
      method: 'deriveSharedKey',
      request: {
        ephemeral_pubkey: Buffer.from(peer, 'hex'),
        key_loc: badLocator,
      },
      type: 'signer',
    },
    description: 'A shared key is not derived at a key locator out of range',
    expected: 'invalid key locator',
    method: errorOf,
  },
  {
    args: {
      method: 'signMessage',
      request: {key_loc: badLocator, msg: message},
      type: 'signer',
    },
    description: 'A message is not signed with a key locator out of range',
    expected: 'invalid key locator',
    method: errorOf,
  },
  {
    args: {channels: [{id: 'abc', partner_public_key: peer}]},
    description: 'Channel ids are in the standard format',
    error: 'ExpectedStandardFormatChannelIdsForChannelToMakeLnd',
    method: makeLnd,
  },
  {
    args: {channels: [{other_ids: ['1:1:1'], partner_public_key: peer}]},
    description: 'Other channel ids are in the standard format',
    error: 'ExpectedStandardFormatChannelIdsForChannelToMakeLnd',
    method: makeLnd,
  },
  {
    args: {
      graph: {
        channels: [{
          id: 'abc',
          policies: [{public_key: peer}, {public_key: other}],
        }],
      },
    },
    description: 'Graph channel ids are in the standard format',
    error: 'ExpectedIdAndTwoPoliciesForGraphChannelToMakeLnd',
    method: makeLnd,
  },
  {
    args: {routes: [{hops: [{channel: 'abc', public_key: peer}]}]},
    description: 'Route hop channel ids are in the standard format',
    error: 'ExpectedValidHopsForRouteToMakeLnd',
    method: makeLnd,
  },
  {
    args: {features: ['38']},
    description: 'Node features are feature bit numbers',
    error: 'ExpectedArrayOfFeatureBitsToMakeLnd',
    method: makeLnd,
  },
  {
    args: {peers: [{features: [-1], public_key: peer}]},
    description: 'Peer features are feature bit numbers',
    error: 'ExpectedFeatureBitsForPeerToMakeLnd',
    method: makeLnd,
  },
  {
    args: {graph: {nodes: [{features: [1.5], public_key: peer}]}},
    description: 'Graph node features are feature bit numbers',
    error: 'ExpectedFeatureBitsForGraphNodeToMakeLnd',
    method: makeLnd,
  },
  {
    args: {network: 'simnet'},
    description: 'A network is a network that lightning knows',
    error: 'ExpectedKnownNetworkNameToMakeLnd',
    method: makeLnd,
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
