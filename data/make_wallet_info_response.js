const makeFeatures = require('./make_features');

const defaultBlockHash = Buffer.alloc(32).toString('hex');
const defaultBlockHeight = 1;
const defaultBlockTime = '1';
const defaultChannels = [];
const defaultFeatures = [1];
const defaultIdentity = Buffer.alloc(33, 2).toString('hex');
const defaultNetwork = 'mainnet';
const defaultPeers = [];

/** Make a response for getInfo

  {
    [block_hash]: <Chain Tip Block Id Hex String>
    [block_height]: <Chain Tip Block Height Number>
    [block_time]: <Chain Tip Block Time Epoch Seconds String>
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
  const isDefaultHeight = args.block_height === undefined;

  // A chain can start at height 0
  const height = isDefaultHeight ? defaultBlockHeight : args.block_height;

  return {
    alias: '',
    best_header_timestamp: args.block_time || defaultBlockTime,
    block_hash: args.block_hash || defaultBlockHash,
    block_height: height,
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
