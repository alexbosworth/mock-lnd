const makeRpcChannel = require('./make_rpc_channel');

const defaultPartner = Buffer.alloc(33, 2).toString('hex');

/** Make a response for list channels

  Without channels, there is a single default channel

  {
    [channels]: [{
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
    }]
  }

  @returns
  <ListChannels Response Object>
*/
module.exports = ({channels}) => {
  // Exit early when there are channels to list
  if (!!channels) {
    return {
      channels: channels.map((channel, index) => {
        return makeRpcChannel({channel, index});
      }),
    };
  }

  const [channel] = [makeRpcChannel({
    channel: {
      id: '0x0x1',
      is_private: true,
      partner_public_key: defaultPartner,
      transaction_vout: 1,
    },
    index: 0,
  })];

  // The default channel has a pending HTLC
  channel.pending_htlcs = [{
    amount: '1',
    expiration_height: 1,
    forwarding_channel: '0',
    forwarding_htlc_index: '0',
    hash_lock: Buffer.alloc(32),
    htlc_index: '0',
    incoming: true,
    locked_in: true,
  }];

  channel.unsettled_balance = '1';

  return {channels: [channel]};
};
