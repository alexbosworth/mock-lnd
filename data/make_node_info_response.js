const makeChanInfoResponse = require('./make_chan_info_response');
const makeFeatures = require('./make_features');

const sum = tokens => tokens.reduce((sum, n) => sum + n, 0);

/** Make a response for getting a node in the graph

  {
    channels: [{
      [capacity]: <Channel Capacity Tokens Number>
      id: <Standard Format Channel Id String>
      policies: [{
        public_key: <Node Public Key Hex String>
      }]
    }]
    [is_including_channels]: <Include Channels Bool>
    node: {
      [alias]: <Node Alias String>
      [color]: <Node Color String>
      [features]: [<Feature Bit Number>]
      public_key: <Node Public Key Hex String>
      [sockets]: [<Host and Port String>]
    }
  }

  @returns
  <NodeInfo Object>
*/
module.exports = args => {
  const {node} = args;

  const nodeChannels = args.channels.filter(channel => {
    return channel.policies.some(n => n.public_key === node.public_key);
  });

  const capacities = nodeChannels.map(n => Number(n.capacity || 1));
  const edges = nodeChannels.map(channel => makeChanInfoResponse({channel}));

  return {
    channels: !args.is_including_channels ? [] : edges,
    node: {
      addresses: (node.sockets || []).map(addr => ({addr, network: 'tcp'})),
      alias: node.alias || '',
      color: node.color || '#000000',
      custom_records: {},
      features: makeFeatures({bits: node.features || []}).features,
      last_update: 1,
      pub_key: node.public_key,
    },
    num_channels: nodeChannels.length,
    total_capacity: String(sum(capacities)),
  };
};
