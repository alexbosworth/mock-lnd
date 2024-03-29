/** Make a response for list channels

  {}

  @returns
  <ListChannels Response Object>
*/
module.exports = ({}) => {
  return {
    channels: [{
      active: true,
      alias_scids: [],
      capacity: 1,
      chan_id: '1',
      channel_point: `${Buffer.alloc(32).toString('hex')}:1`,
      close_address: 'cooperative_close_address',
      commit_fee: '1',
      commit_weight: '1',
      commitment_type: 'LEGACY',
      fee_per_kw: '1',
      initiator: true,
      lifetime: 1,
      local_balance: '1',
      local_chan_reserve_sat: '1',
      local_constraints: {
        chan_reserve_sat: '1',
        csv_delay: 1,
        dust_limit_sat: '1',
        max_accepted_htlcs: 1,
        max_pending_amt_msat: '1',
        min_htlc_msat: '1',
      },
      num_updates: 1,
      pending_htlcs: [{
        amount: '1',
        expiration_height: 1,
        hash_lock: Buffer.alloc(32),
        incoming: true,
      }],
      private: true,
      remote_balance: 1,
      remote_chan_reserve_sat: '1',
      remote_constraints: {
        chan_reserve_sat: '1',
        csv_delay: 1,
        dust_limit_sat: '1',
        max_accepted_htlcs: 1,
        max_pending_amt_msat: '1',
        min_htlc_msat: '1',
      },
      remote_pubkey: Buffer.alloc(33, 2).toString('hex'),
      thaw_height: 0,
      total_satoshis_received: 1,
      total_satoshis_sent: 1,
      unsettled_balance: 1,
      uptime: 1,
    }],
  };
};
