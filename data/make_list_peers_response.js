const makeFeatures = require('./make_features');

const defaultSocket = '127.0.0.1:9735';

/** Make a response for listing connected peers

  {
    peers: [{
      [features]: [<Feature Bit Number>]
      [is_inbound]: <Peer Connected Inbound Bool>
      public_key: <Peer Public Key Hex String>
      [socket]: <Peer Network Address String>
    }]
  }

  @returns
  <ListPeersResponse Object>
*/
module.exports = ({peers}) => {
  return {
    peers: peers.map(peer => ({
      address: peer.socket || defaultSocket,
      bytes_recv: '0',
      bytes_sent: '0',
      errors: [],
      features: makeFeatures({bits: peer.features || []}).features,
      flap_count: 0,
      inbound: !!peer.is_inbound,
      last_flap_ns: '0',
      last_ping_payload: Buffer.alloc(0),
      ping_time: '0',
      pub_key: peer.public_key,
      sat_recv: '0',
      sat_sent: '0',
      sync_type: 'ACTIVE_SYNC',
    })),
  };
};
