const {chanFormat} = require('bolt07');

const routeBlindingBits = [24, 25];

/** Determine if a channel peer can start a blinded path to the node

  LND only starts a blinded path at a peer that signals route blinding and
  has a channel besides the one to the node. A peer that the graph does not
  describe is not checked.

  {
    channels: [<RPC Channel Object>]
    graph: {
      channels: [{
        id: <Standard Format Channel Id String>
        policies: [{
          public_key: <Node Public Key Hex String>
        }]
      }]
      nodes: [{
        [features]: [<Feature Bit Number>]
        public_key: <Node Public Key Hex String>
      }]
    }
    peer: <Peer Public Key Hex String>
  }

  @returns
  {
    is_introduction: <Peer Can Start a Blinded Path Bool>
  }
*/
module.exports = ({channels, graph, peer}) => {
  const node = graph.nodes.find(n => n.public_key === peer);
  const peerChannels = graph.channels.filter(channel => {
    return channel.policies.some(n => n.public_key === peer);
  });

  // Exit early when the graph does not describe the peer
  if (!node && !peerChannels.length) {
    return {is_introduction: true};
  }

  const features = !!node ? node.features || [] : [];

  // Exit early when the peer does not signal support for route blinding
  if (!features.some(bit => routeBlindingBits.includes(bit))) {
    return {is_introduction: false};
  }

  // The channels of the node with the peer are channels of the peer too
  const withNode = channels
    .filter(channel => channel.remote_pubkey === peer)
    .map(channel => chanFormat({number: channel.chan_id}).channel);

  const ids = new Set(peerChannels.map(n => n.id).concat(withNode));

  return {is_introduction: ids.size > 1};
};
