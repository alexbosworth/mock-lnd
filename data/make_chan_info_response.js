const {chanNumber} = require('bolt07');

const byPublicKey = (a, b) => a.public_key < b.public_key ? -1 : 1;
const defaultTxId = Buffer.alloc(32).toString('hex');
const tokensAsString = (n, fallback) => String(n === undefined ? fallback : n);
const valueOr = (n, fallback) => n === undefined ? fallback : n;

/** Make a response for getting a channel in the graph

  The first node of an edge is the node with the lesser public key

  {
    channel: {
      [capacity]: <Channel Capacity Tokens Number>
      id: <Standard Format Channel Id String>
      policies: [{
        [base_fee_mtokens]: <Base Fee Millitokens String>
        [cltv_delta]: <Locktime Delta Number>
        [fee_rate]: <Fees Charged Per Million Millitokens Number>
        [is_disabled]: <Channel Is Disabled Bool>
        [max_htlc_mtokens]: <Maximum HTLC Millitokens Value String>
        [min_htlc_mtokens]: <Minimum HTLC Millitokens Value String>
        public_key: <Node Public Key Hex String>
      }]
      [transaction_id]: <Funding Transaction Id Hex String>
      [transaction_vout]: <Funding Transaction Output Index Number>
    }
  }

  @returns
  <ChannelEdge Object>
*/
module.exports = ({channel}) => {
  // Public keys are lowercase hex, so they sort like their bytes sort
  const policies = channel.policies.slice().sort(byPublicKey);

  // Policy values that are zero are kept, and missing values have defaults
  const [node1, node2] = policies.map(policy => ({
    custom_records: {},
    disabled: !!policy.is_disabled,
    fee_base_msat: tokensAsString(policy.base_fee_mtokens, '1000'),
    fee_rate_milli_msat: tokensAsString(policy.fee_rate, 1),
    inbound_fee_base_msat: 0,
    inbound_fee_rate_milli_msat: 0,
    last_update: 1,
    max_htlc_msat: tokensAsString(policy.max_htlc_mtokens, '1000'),
    min_htlc: tokensAsString(policy.min_htlc_mtokens, '1000'),
    time_lock_delta: valueOr(policy.cltv_delta, 40),
  }));

  return {
    capacity: tokensAsString(channel.capacity, 1),
    chan_point: [
      channel.transaction_id || defaultTxId,
      channel.transaction_vout || 0,
    ].join(':'),
    channel_id: chanNumber({channel: channel.id}).number,
    custom_records: {},
    last_update: 1,
    node1_policy: node1,
    node1_pub: policies[0].public_key,
    node2_policy: node2,
    node2_pub: policies[1].public_key,
  };
};
