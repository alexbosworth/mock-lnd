const makeFeatures = require('./make_features');

const defaultChannels = [];
const defaultFeatures = [1];
const defaultIdentity = Buffer.alloc(33, 2).toString('hex');
const defaultNetwork = 'mainnet';
const defaultPeers = [];

/** Make a response for getInfo

  {
    [channels]: [<RPC Channel Object>]
    [features]: [<Feature Bit Number>]
    [identity]: <Node Identity Public Key Hex String>
    [network]: <Network Name String>
    [peers]: [<Peer Object>]
  }

  @returns
  <GetInfo Response Object>
*/
module.exports = args => {
  const channels = args.channels || defaultChannels;

  const active = channels.filter(n => !!n.active);

  return {
    alias: '',
    best_header_timestamp: '1',
    block_hash: Buffer.alloc(32).toString('hex'),
    block_height: 1,
    chains: [{chain: 'bitcoin', network: args.network || defaultNetwork}],
    color: '#000000',
    features: makeFeatures({bits: args.features || defaultFeatures}).features,
    identity_pubkey: args.identity || defaultIdentity,
    num_active_channels: active.length,
    num_inactive_channels: channels.length - active.length,
    num_peers: (args.peers || defaultPeers).length,
    num_pending_channels: 0,
    synced_to_chain: false,
    uris: [],
    version: '',
  };
};
