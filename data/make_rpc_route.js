const {chanNumber} = require('bolt07');

const finalCltvDelta = 40;

/** Make an RPC route through hops, without fees

  {
    hops: [{
      [channel]: <Standard Format Channel Id String>
      public_key: <Hop Public Key Hex String>
    }]
    mtokens: <Amount To Send Millitokens String>
  }

  @returns
  <RPC Route Object>
*/
module.exports = ({hops, mtokens}) => {
  return {
    hops: hops.map((hop, i) => ({
      amt_to_forward_msat: mtokens,
      chan_id: chanNumber({channel: hop.channel || `${i + 1}x1x1`}).number,
      custom_records: {},
      expiry: finalCltvDelta,
      fee_msat: '0',
      pub_key: hop.public_key,
    })),
    total_amt_msat: mtokens,
    total_fees_msat: '0',
    total_time_lock: finalCltvDelta,
  };
};
