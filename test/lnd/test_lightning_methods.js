const {createHash} = require('node:crypto');
const {createPublicKey} = require('node:crypto');
const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');
const {verify} = require('node:crypto');

const {blindedPathFromHops} = require('bolt04');
const {createInvoice} = require('lightning');
const {diffieHellmanComputeSecret} = require('lightning');
const {getChannel} = require('lightning');
const {getChannels} = require('lightning');
const {getIdentity} = require('lightning');
const {getInvoice} = require('lightning');
const {getNode} = require('lightning');
const {getPeers} = require('lightning');
const {getPublicKey} = require('lightning');
const {getRouteToDestination} = require('lightning');
const {getWalletInfo} = require('lightning');
const {parsePaymentRequest} = require('invoices');
const {pointCompress} = require('tiny-secp256k1');
const {pointFromScalar} = require('tiny-secp256k1');
const {pointMultiply} = require('tiny-secp256k1');
const {sendMessage} = require('lightning');
const {signBytes} = require('lightning');
const {subscribeToInvoices} = require('lightning');
const {subscribeToMessages} = require('lightning');
const {verifySchnorr} = require('tiny-secp256k1');

const {makeLnd} = require('./../../');
const {makeOnionMessage} = require('./../../');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const identity = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const message = Buffer.from('message');
const noPaths = 'could not find any routes to self to use for blinded route construction';
const other = '02531fe6068134503d2723133227c867ac8fa6c83c537e9a44c3c5bdbdcb1fe337';
const peer = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const regtestChain = '06226e46111a0b59caaf126043eb5bbf28c34f3a5e332a1fc7b2b73cf188910f';
const secretOf = n => Buffer.alloc(32, n);
const sha256 = n => createHash('sha256').update(n).digest();
const strict = args => makeLnd({...args, is_strict: true});

// The public key of a private key that is 32 bytes of a number
const asKey = n => {
  const publicKey = pointFromScalar(secretOf(n), true);

  return bufferAsHex(publicKey);
};

// The ECDH shared secret of a secret and a public key, as LND derives it
const sharedSecret = (secret, key) => {
  return bufferAsHex(sha256(pointMultiply(hexAsBuffer(key), secret, true)));
};

// Verify a DER ECDSA signature of the SHA256 hash of a message
const verifyEcdsa = args => {
  const publicKey = hexAsBuffer(args.public_key);

  const point = Buffer.from(pointCompress(publicKey, false));

  const key = createPublicKey({
    format: 'jwk',
    key: {
      crv: 'secp256k1',
      kty: 'EC',
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33).toString('base64url'),
    },
  });

  return verify('sha256', args.message, key, hexAsBuffer(args.signature));
};

// Options for a fake LND with channels with the peer and the other node,
// where the peer has another channel and the other node does not, and where
// both of the nodes have features
const graphOptions = features => ({
  channels: [
    {id: '1x1x1', partner_public_key: peer},
    {id: '2x2x2', partner_public_key: other},
  ],
  graph: {
    channels: [
      {id: '1x1x1', policies: [{public_key: identity}, {public_key: peer}]},
      {id: '2x2x2', policies: [{public_key: identity}, {public_key: other}]},
      {id: '3x3x3', policies: [{public_key: peer}, {public_key: asKey(4)}]},
    ],
    nodes: [{features, public_key: other}, {features, public_key: peer}],
  },
});

// Make a strict fake LND with a graph of a channel between the peer and the
// other node, and of the peer node
const graphLnd = () => strict({
  graph: {
    channels: [{
      capacity: 5,
      id: '1x1x1',
      policies: [{public_key: other}, {cltv_delta: 80, public_key: peer}],
    }],
    nodes: [{
      alias: 'alias',
      features: [38],
      public_key: peer,
      sockets: ['127.0.0.1:9735'],
    }],
  },
});

// Get the identity of a strict fake LND, and the key in its wallet info
const identityOf = async args => {
  const lnd = strict(args);

  const got = await getIdentity({lnd});
  const info = await getWalletInfo({lnd});

  return {identity: got.public_key, wallet: info.public_key};
};

// Get a public key at a locator of a strict fake LND, and again with a fake
// LND like it, and check the key is the same, and is not the identity key
const derivedKeys = async ({family, index}) => {
  const lnd = strict({});
  const same = strict({});

  const first = await getPublicKey({family, index, lnd});
  const again = await getPublicKey({family, index, lnd: same});

  return {
    is_identity: first.public_key === identity,
    is_same: first.public_key === again.public_key,
  };
};

// Get the public key at a key locator of a strict fake LND with given keys
const keyAt = async args => {
  const lnd = strict({keys: args.keys});

  return await getPublicKey({lnd, family: args.family, index: args.index});
};

// Get next keys in key families of a strict fake LND with next key indexes
const nextKeyIndexes = async ({}) => {
  const lnd = strict({next_key_indexes: [{family: 805, index: 4}]});

  const next = await getPublicKey({lnd, family: 805});

  const after = await getPublicKey({lnd, family: 805});

  const fresh = await getPublicKey({lnd, family: 806});

  return [next.index, after.index, fresh.index];
};

// Compute a shared secret with the peer with the node key of a fake LND
const identitySecret = async ({}) => {
  const lnd = strict({});

  return await diffieHellmanComputeSecret({lnd, partner_public_key: peer});
};

// Compute a shared secret with the peer with a key at a locator of a strict
// fake LND, and check that the peer computes the same secret with the key
const isLocatorSecret = async ({family, index}) => {
  const lnd = strict({});

  const key = await getPublicKey({family, index, lnd});

  const {secret} = await diffieHellmanComputeSecret({
    lnd,
    key_family: family,
    key_index: index,
    partner_public_key: peer,
  });

  return secret === sharedSecret(secretOf(2), key.public_key);
};

// Sign the message with Schnorr with a key at a locator of a strict fake LND,
// and check that the signature signs the tagged hash of the message
const isSchnorrSigned = async ({tag}) => {
  const lnd = strict({});

  const key = await getPublicKey({lnd, family: 805, index: 2});
  const tagHash = sha256(Buffer.from(tag));

  const {signature} = await signBytes({
    lnd,
    tag,
    key_family: 805,
    key_index: 2,
    preimage: bufferAsHex(message),
    type: 'schnorr',
  });

  return verifySchnorr(
    sha256(Buffer.concat([tagHash, tagHash, message])),
    hexAsBuffer(key.public_key).subarray(1),
    hexAsBuffer(signature)
  );
};

// Sign the message with ECDSA with a key at a locator of a strict fake LND,
// and check that the signature signs the hash of the message
const isEcdsaSigned = async ({}) => {
  const lnd = strict({});

  const key = await getPublicKey({lnd, family: 805, index: 2});

  const {signature} = await signBytes({
    lnd,
    key_family: 805,
    key_index: 2,
    preimage: bufferAsHex(message),
  });

  return verifyEcdsa({message, signature, public_key: key.public_key});
};

// Get the wallet info of a strict fake LND
const walletInfoOf = async args => {
  const info = await getWalletInfo({lnd: strict(args)});

  return {
    active_channels_count: info.active_channels_count,
    chains: info.chains,
    features: info.features.map(n => n.bit),
    peers_count: info.peers_count,
    public_key: info.public_key,
  };
};

// Get the peers of a strict fake LND
const peersOf = async args => {
  const {peers} = await getPeers({lnd: strict(args)});

  return peers.map(n => ({
    features: n.features.map(feature => feature.bit),
    is_inbound: n.is_inbound,
    public_key: n.public_key,
    socket: n.socket,
  }));
};

// Get the channels of a strict fake LND
const channelsOf = async args => {
  const {channels} = await getChannels({lnd: strict(args)});

  return channels.map(n => ({
    capacity: n.capacity,
    id: n.id,
    is_active: n.is_active,
    is_private: n.is_private,
    other_ids: n.other_ids,
    partner_public_key: n.partner_public_key,
  }));
};

// Get a channel of the graph of a strict fake LND
const graphChannel = async ({id}) => {
  const lnd = graphLnd();

  const got = await getChannel({id, lnd}).catch(err => ({err}));

  // Exit early when the channel is not found
  if (!!got.err) {
    return got;
  }

  return {
    capacity: got.capacity,
    id: got.id,
    policies: got.policies.map(n => [n.public_key, n.cltv_delta]),
  };
};

// Get a node of the graph of a strict fake LND
const graphNode = async ({key}) => {
  const lnd = graphLnd();

  const got = await getNode({lnd, public_key: key}).catch(err => ({err}));

  // Exit early when the node is not found
  if (!!got.err) {
    return got;
  }

  return {
    alias: got.alias,
    channels: got.channels.map(n => n.id),
    features: got.features.map(n => n.bit),
    sockets: got.sockets.map(n => n.socket),
  };
};

// Get the hops of a route to a destination among the routes of a strict fake
// LND, avoiding ignored nodes
const routeHops = async ({ignore}) => {
  const destination = asKey(9);

  const lnd = strict({
    routes: [
      {hops: [{public_key: peer}, {public_key: destination}]},
      {hops: [{public_key: other}, {public_key: destination}]},
      {hops: [{public_key: other}]},
    ],
  });

  const {route} = await getRouteToDestination({
    destination,
    ignore,
    lnd,
    tokens: 1,
  });

  return !route ? null : route.hops.map(n => n.public_key);
};

// Create an invoice with a strict fake LND, and get the invoice, its payment
// request, and the update to the invoice
const createdInvoice = async ({}) => {
  const lnd = strict({network: 'regtest'});

  const invoices = subscribeToInvoices({lnd});

  const updated = new Promise(resolve => {
    return invoices.once('invoice_updated', resolve);
  });

  const created = await createInvoice({
    lnd,
    description: 'description',
    mtokens: '1000',
  });

  const invoice = await getInvoice({lnd, id: created.id});
  const request = parsePaymentRequest({request: created.request});

  const hash = bufferAsHex(sha256(hexAsBuffer(invoice.secret)));
  const update = await updated;

  invoices.removeAllListeners();

  return {
    description: invoice.description,
    features: invoice.features.map(n => n.bit),
    is_confirmed: invoice.is_confirmed,
    is_hash_of_preimage: hash === created.id,
    is_request_for_invoice: request.id === created.id,
    is_request_of_invoice: invoice.request === created.request,
    is_updated: update.id === created.id,
    mtokens: invoice.mtokens,
    request_destination: request.destination,
    request_features: request.features.map(n => n.bit),
    request_network: request.network,
  };
};

// Create a blinded invoice with a strict fake LND, and get the nodes that its
// paths start at, or the error that creating the invoice fails with
const blindedIntroductions = async args => {
  const lnd = strict(args);

  const created = await createInvoice({lnd, is_encrypting_routes: true})
    .catch(([code, type, {err}]) => ({failure: [code, type, err.details]}));

  // Exit early when the invoice is not created
  if (!!created.failure) {
    return created.failure;
  }

  const {paths} = parsePaymentRequest({request: created.request});

  return paths.map(n => n.introduction_node);
};

// Send an onion message to the peer with a strict fake LND, and get the peer
// that the message is sent to, or the error that sending fails with
const sentTo = async args => {
  const lnd = strict(args);

  const {key, path} = blindedPathFromHops({hops: [peer, identity]});

  const failure = await sendMessage({
    key,
    lnd,
    inbound: path,
    message: {type: '64', value: '00'},
    outbound: [peer],
  })
  .then(() => null, err => err);

  // Exit early when the message is not sent
  if (!!failure) {
    return {err: failure};
  }

  const [call] = lnd.calls.filter(n => n.method === 'sendOnionMessage');

  return bufferAsHex(call.args.peer);
};

// Get an onion message that a subscription to the messages of a strict fake
// LND receives
const receivedMessage = async args => {
  const lnd = strict({});

  const sub = subscribeToMessages({lnd});

  const received = new Promise(resolve => {
    return sub.once('message_received', resolve);
  });

  const [{subscription}] = lnd.calls.filter(n => {
    return n.method === 'subscribeOnionMessages';
  });

  subscription.emit('data', makeOnionMessage(args));

  const got = await received;

  sub.removeAllListeners();

  return got;
};

const tests = [
  {
    args: {},
    description: 'The identity is the public key of the node secret',
    expected: {identity, wallet: identity},
    method: identityOf,
  },
  {
    args: {secret: bufferAsHex(secretOf(9))},
    description: 'The identity is the public key of a given node secret',
    expected: {identity: asKey(9), wallet: asKey(9)},
    method: identityOf,
  },
  {
    args: {family: 805, index: 0},
    description: 'Keys are derived from the node secret',
    expected: {is_identity: false, is_same: true},
    method: derivedKeys,
  },
  {
    args: {
      family: 805,
      index: 3,
      keys: [{family: 805, index: 3, secret: bufferAsHex(secretOf(5))}],
    },
    description: 'Keys that are given are used at their locators',
    expected: {index: 3, public_key: asKey(5)},
    method: keyAt,
  },
  {
    args: {
      family: 6,
      index: 0,
      keys: [{family: 805, index: 3, secret: bufferAsHex(secretOf(5))}],
    },
    description: 'The key at the identity locator is the identity key',
    expected: {index: 0, public_key: identity},
    method: keyAt,
  },
  {
    args: {},
    description: 'The next keys in a family are from its next key index',
    expected: [4, 5, 0],
    method: nextKeyIndexes,
  },
  {
    args: {},
    description: 'Shared secrets are derived with the node key',
    expected: {secret: sharedSecret(secretOf(2), identity)},
    method: identitySecret,
  },
  {
    args: {family: 805, index: 1},
    description: 'Shared secrets can be derived with keys at key locators',
    expected: true,
    method: isLocatorSecret,
  },
  {
    args: {tag: 'tag'},
    description: 'Bytes are signed with Schnorr with keys at key locators',
    expected: true,
    method: isSchnorrSigned,
  },
  {
    args: {},
    description: 'Bytes are signed with ECDSA with keys at key locators',
    expected: true,
    method: isEcdsaSigned,
  },
  {
    args: {
      channels: [{partner_public_key: peer}],
      features: [38],
      network: 'regtest',
      peers: [{public_key: peer}],
    },
    description: 'Wallet info describes the node',
    expected: {
      active_channels_count: 1,
      chains: [regtestChain],
      features: [38],
      peers_count: 1,
      public_key: identity,
    },
    method: walletInfoOf,
  },
  {
    args: {
      peers: [
        {public_key: peer},
        {
          features: [38],
          is_inbound: true,
          public_key: other,
          socket: '[::1]:9',
        },
      ],
    },
    description: 'Peers are connected peers',
    expected: [
      {
        features: [],
        is_inbound: false,
        public_key: peer,
        socket: '127.0.0.1:9735',
      },
      {features: [38], is_inbound: true, public_key: other, socket: '[::1]:9'},
    ],
    method: peersOf,
  },
  {
    args: {},
    description: 'There are no peers by default',
    expected: [],
    method: peersOf,
  },
  {
    args: {
      channels: [
        {
          capacity: 3,
          id: '1x2x3',
          other_ids: ['4x5x6'],
          partner_public_key: peer,
        },
        {is_active: false, is_private: true, partner_public_key: other},
      ],
    },
    description: 'Channels are channels with partners',
    expected: [
      {
        capacity: 3,
        id: '1x2x3',
        is_active: true,
        is_private: false,
        other_ids: ['4x5x6'],
        partner_public_key: peer,
      },
      {
        capacity: 1,
        id: '2x1x1',
        is_active: false,
        is_private: true,
        other_ids: [],
        partner_public_key: other,
      },
    ],
    method: channelsOf,
  },
  {
    args: {},
    description: 'There is a channel by default',
    expected: [
      {
        capacity: 1,
        id: '0x0x1',
        is_active: true,
        is_private: true,
        other_ids: [],
        partner_public_key: '02'.repeat(33),
      },
    ],
    method: channelsOf,
  },
  {
    args: {id: '1x1x1'},
    description: 'Channels of the graph are known',
    expected: {capacity: 5, id: '1x1x1', policies: [[peer, 80], [other, 40]]},
    method: graphChannel,
  },
  {
    args: {id: '2x2x2'},
    description: 'A channel that is not in the graph is not found',
    expected: {err: [404, 'FullChannelDetailsNotFound']},
    method: graphChannel,
  },
  {
    args: {key: peer},
    description: 'Nodes of the graph are known',
    expected: {
      alias: 'alias',
      channels: ['1x1x1'],
      features: [38],
      sockets: ['127.0.0.1:9735'],
    },
    method: graphNode,
  },
  {
    args: {key: other},
    description: 'A node that is not in the graph is unknown',
    expected: {err: [404, 'NodeIsUnknown']},
    method: graphNode,
  },
  {
    args: {},
    description: 'The first route to a destination is found',
    expected: [peer, asKey(9)],
    method: routeHops,
  },
  {
    args: {ignore: [{from_public_key: peer}]},
    description: 'A route is found that avoids ignored nodes',
    expected: [other, asKey(9)],
    method: routeHops,
  },
  {
    args: {ignore: [{from_public_key: peer}, {from_public_key: other}]},
    description: 'There is no route when no route avoids ignored nodes',
    expected: null,
    method: routeHops,
  },
  {
    args: {},
    description: 'Invoices are created and looked up',
    expected: {
      description: 'description',
      features: [8, 14, 17, 25],
      is_confirmed: false,
      is_hash_of_preimage: true,
      is_request_for_invoice: true,
      is_request_of_invoice: true,
      is_updated: true,
      mtokens: '1000',
      request_destination: identity,
      request_features: [8, 14, 17, 25],
      request_network: 'regtest',
    },
    method: createdInvoice,
  },
  {
    args: {channels: [{id: '1x1x1', partner_public_key: peer}]},
    description: 'Blinded invoices have paths in through channels',
    expected: [peer],
    method: blindedIntroductions,
  },
  {
    args: {channels: []},
    description: 'A blinded invoice needs a channel to have paths',
    expected: [503, 'AddInvoiceError', noPaths],
    method: blindedIntroductions,
  },
  {
    args: graphOptions([25]),
    description: 'Only a peer with another channel starts a blinded path',
    expected: [peer],
    method: blindedIntroductions,
  },
  {
    args: graphOptions([]),
    description: 'A peer without route blinding does not start a path',
    expected: [503, 'AddInvoiceError', noPaths],
    method: blindedIntroductions,
  },
  {
    args: {peers: [{public_key: peer}]},
    description: 'Onion messages are sent to connected peers',
    expected: peer,
    method: sentTo,
  },
  {
    args: {},
    description: 'An onion message is not sent to a disconnected peer',
    expected: {err: [503, 'ExpectedConnectedOutboundPeerToSendMessage']},
    method: sentTo,
  },
  {
    args: {
      encrypted: '0102',
      key: other,
      message: {type: '64', value: '0a0b'},
      onion: '00'.repeat(10),
      reply: {
        inbound: [{encrypted_data: '03', relay_key: asKey(4)}],
        introduction_node: peer,
        key: asKey(5),
      },
      via: peer,
    },
    description: 'Onion messages are received over subscriptions',
    expected: {
      encrypted: '0102',
      key: other,
      message: {type: '64', value: '0a0b'},
      onion: '00'.repeat(10),
      reply: {
        inbound: [{encrypted_data: '03', relay_key: asKey(4)}],
        introduction_edge: undefined,
        introduction_node: peer,
        key: asKey(5),
      },
      via: peer,
    },
    method: receivedMessage,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, async () => {
    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
