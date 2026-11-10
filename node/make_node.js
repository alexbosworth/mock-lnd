const deriveKey = require('./derive_key');
const isChannelIds = require('./is_channel_ids');
const isFeatureBits = require('./is_feature_bits');
const isHops = require('./is_hops');
const isKeyLocator = require('./is_key_locator');
const isNodeSecret = require('./is_node_secret');

const defaultNetwork = 'mainnet';
const defaultSecret = Buffer.alloc(32, 1).toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const {isArray} = Array;
const isChannelId = n => typeof n === 'string' && /^\d+x\d+x\d+$/.test(n);
const isKey = n => typeof n === 'string' && /^0[23][0-9A-F]{64}$/i.test(n);
const lowerKey = n => ({...n, public_key: n.public_key.toLowerCase()});
const networks = ['mainnet', 'regtest', 'signet', 'testnet', 'testnet4'];

/** Make the state of a fake LND node

  {
    [channels]: [{
      partner_public_key: <Peer Public Key Hex String>
    }]
    [features]: [<Feature Bit Number>]
    [graph]: {
      [channels]: [{
        id: <Standard Format Channel Id String>
        policies: [{
          public_key: <Node Public Key Hex String>
        }]
      }]
      [nodes]: [{
        public_key: <Node Public Key Hex String>
      }]
    }
    [keys]: [{
      family: <Key Family Number>
      index: <Key Index Number>
      secret: <Private Key Hex String>
    }]
    [network]: <Network Name String>
    [next_key_indexes]: [{
      family: <Key Family Number>
      index: <Next Key Index Number>
    }]
    [peers]: [{
      public_key: <Peer Public Key Hex String>
    }]
    [routes]: [{
      hops: [{
        public_key: <Hop Public Key Hex String>
      }]
    }]
    [secret]: <Node Identity Private Key Hex String>
  }

  @throws
  <Error>

  @returns
  {
    calls: [<Call Object>]
    [channels]: [<Channel Object>]
    [features]: [<Feature Bit Number>]
    graph: {
      channels: [<Graph Channel Object>]
      nodes: [<Graph Node Object>]
    }
    identity: <Node Identity Public Key Hex String>
    invoices: [<RPC Invoice Object>]
    keys: [<Key Object>]
    network: <Network Name String>
    next_key_indexes: {
      <Key Family Number>: <Next Key Index Number>
    }
    peers: [<Peer Object>]
    [routes]: [<Route Object>]
    secret: <Node Secret Buffer Object>
    streams: [{
      args: <RPC Arguments Object>
      method: <RPC Method Name String>
      subscription: <Stream EventEmitter Object>
      type: <Sub-Server Type String>
    }]
  }
*/
module.exports = args => {
  if (args.channels !== undefined && !isArray(args.channels)) {
    throw new Error('ExpectedArrayOfChannelsToMakeLnd');
  }

  const channels = args.channels || [];

  if (!channels.every(n => isKey(n.partner_public_key))) {
    throw new Error('ExpectedPartnerPublicKeyForChannelToMakeLnd');
  }

  if (!channels.every(isChannelIds)) {
    throw new Error('ExpectedStandardFormatChannelIdsForChannelToMakeLnd');
  }

  if (!isFeatureBits({bits: args.features})) {
    throw new Error('ExpectedArrayOfFeatureBitsToMakeLnd');
  }

  const graph = args.graph || {};

  if (!(graph.channels || []).every(n => isChannelId(n.id))) {
    throw new Error('ExpectedIdAndTwoPoliciesForGraphChannelToMakeLnd');
  }

  const edges = (graph.channels || []).map(n => n.policies);

  if (!edges.every(n => isArray(n) && n.length === 2 && isHops({hops: n}))) {
    throw new Error('ExpectedIdAndTwoPoliciesForGraphChannelToMakeLnd');
  }

  if (!(graph.nodes || []).every(n => isKey(n.public_key))) {
    throw new Error('ExpectedPublicKeyForGraphNodeToMakeLnd');
  }

  if (!(graph.nodes || []).every(n => isFeatureBits({bits: n.features}))) {
    throw new Error('ExpectedFeatureBitsForGraphNodeToMakeLnd');
  }

  if (args.keys !== undefined && !isArray(args.keys)) {
    throw new Error('ExpectedArrayOfKeysToMakeLnd');
  }

  if (!(args.keys || []).every(n => isKeyLocator(n) && isNodeSecret(n))) {
    throw new Error('ExpectedLocatorAndPrivateKeyForKeyToMakeLnd');
  }

  if (!!args.network && !networks.includes(args.network)) {
    throw new Error('ExpectedKnownNetworkNameToMakeLnd');
  }

  if (args.next_key_indexes !== undefined && !isArray(args.next_key_indexes)) {
    throw new Error('ExpectedArrayOfNextKeyIndexesToMakeLnd');
  }

  if (!(args.next_key_indexes || []).every(isKeyLocator)) {
    throw new Error('ExpectedFamilyAndIndexForNextKeyIndexToMakeLnd');
  }

  if (args.peers !== undefined && !isArray(args.peers)) {
    throw new Error('ExpectedArrayOfPeersToMakeLnd');
  }

  if (!(args.peers || []).every(n => isKey(n.public_key))) {
    throw new Error('ExpectedPublicKeyForPeerToMakeLnd');
  }

  if (!(args.peers || []).every(n => isFeatureBits({bits: n.features}))) {
    throw new Error('ExpectedFeatureBitsForPeerToMakeLnd');
  }

  if (args.routes !== undefined && !isArray(args.routes)) {
    throw new Error('ExpectedArrayOfRoutesToMakeLnd');
  }

  if (!(args.routes || []).every(isHops)) {
    throw new Error('ExpectedValidHopsForRouteToMakeLnd');
  }

  if (args.secret !== undefined && !isNodeSecret({secret: args.secret})) {
    throw new Error('ExpectedValidNodeSecretToMakeLnd');
  }

  const keys = args.keys || [];
  const secret = hexAsBuffer(args.secret || defaultSecret);

  const identity = deriveKey({keys, secret, family: 6, index: 0}).public_key;

  // Keys are derived in a family from the next key index of the family
  const nextIndexes = (args.next_key_indexes || []).reduce((sum, n) => {
    sum[n.family] = n.index;

    return sum;
  },
  {});

  // Public keys are lowercase, as LND has them
  const graphChannels = (graph.channels || []).map(channel => ({
    ...channel,
    policies: channel.policies.map(lowerKey),
  }));

  const ownChannels = channels.map(channel => ({
    ...channel,
    partner_public_key: channel.partner_public_key.toLowerCase(),
  }));

  const routes = (args.routes || []).map(route => ({
    ...route,
    hops: route.hops.map(lowerKey),
  }));

  return {
    keys,
    secret,
    calls: [],
    channels: !args.channels ? undefined : ownChannels,
    features: args.features,
    graph: {
      channels: graphChannels,
      nodes: (graph.nodes || []).map(lowerKey),
    },
    identity: identity.toString('hex'),
    invoices: [],
    network: args.network || defaultNetwork,
    next_key_indexes: nextIndexes,
    peers: (args.peers || []).map(lowerKey),
    routes: !args.routes ? undefined : routes,
    streams: [],
  };
};
