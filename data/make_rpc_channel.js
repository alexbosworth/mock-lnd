const {chanNumber} = require('bolt07');

const defaultTxId = Buffer.alloc(32).toString('hex');
const tokensAsString = (n, fallback) => String(n === undefined ? fallback : n);

/** Make an RPC channel of the node with a partner

  {
    channel: {
      [capacity]: <Channel Capacity Tokens Number>
      [id]: <Standard Format Channel Id String>
      [is_active]: <Channel Is Active Bool>
      [is_private]: <Channel Is Private Bool>
      [local_balance]: <Local Balance Tokens Number>
      [other_ids]: [<Other Standard Format Channel Id String>]
      partner_public_key: <Peer Public Key Hex String>
      [remote_balance]: <Remote Balance Tokens Number>
      [transaction_id]: <Funding Transaction Id Hex String>
      [transaction_vout]: <Funding Transaction Output Index Number>
    }
    index: <Channel Index Number>
  }

  @returns
  <RPC Channel Object>
*/
module.exports = ({channel, index}) => {
  // Without an id or an outpoint, a channel is given them by its position
  const hasVout = channel.transaction_vout !== undefined;
  const id = channel.id || `${index + 1}x1x1`;
  const txId = channel.transaction_id || defaultTxId;

  const vout = hasVout ? channel.transaction_vout : index + 1;

  return {
    active: channel.is_active !== false,
    alias_scids: (channel.other_ids || []).map(n => {
      return chanNumber({channel: n}).number;
    }),
    capacity: tokensAsString(channel.capacity, 1),
    chan_id: chanNumber({channel: id}).number,
    channel_point: `${txId}:${vout}`,
    close_address: 'cooperative_close_address',
    commit_fee: '1',
    commit_weight: '1',
    commitment_type: 'LEGACY',
    fee_per_kw: '1',
    initiator: true,
    lifetime: '1',
    local_balance: tokensAsString(channel.local_balance, 1),
    local_chan_reserve_sat: '1',
    local_constraints: {
      chan_reserve_sat: '1',
      csv_delay: 1,
      dust_limit_sat: '1',
      max_accepted_htlcs: 1,
      max_pending_amt_msat: '1',
      min_htlc_msat: '1',
    },
    num_updates: '1',
    pending_htlcs: [],
    private: !!channel.is_private,
    remote_balance: tokensAsString(channel.remote_balance, 1),
    remote_chan_reserve_sat: '1',
    remote_constraints: {
      chan_reserve_sat: '1',
      csv_delay: 1,
      dust_limit_sat: '1',
      max_accepted_htlcs: 1,
      max_pending_amt_msat: '1',
      min_htlc_msat: '1',
    },
    remote_pubkey: channel.partner_public_key,
    thaw_height: 0,
    total_satoshis_received: '1',
    total_satoshis_sent: '1',
    unsettled_balance: '0',
    uptime: '1',
  };
};
