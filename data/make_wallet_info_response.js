/** Make a response for getInfo

  {}

  @returns
  <GetInfo Response Object>
*/
module.exports = ({}) => {
  return {
    alias: '',
    best_header_timestamp: 1,
    block_hash: Buffer.alloc(32).toString('hex'),
    block_height: 1,
    chains: [{chain: 'bitcoin', network: 'mainnet'}],
    color: '#000000',
    features: {'1': {is_known: true, is_required: false}},
    identity_pubkey: '020000000000000000000000000000000000000000000000000000000000000000',
    num_active_channels: 0,
    num_peers: 0,
    num_pending_channels: 0,
    synced_to_chain: false,
    uris: [],
    version: '',
  };
};
