/** Make a query routes response

  {}

  @returns
  <Query Routes Response Object>
*/
module.exports = ({}) => {
  return {
    routes: [{
      hops: [{
        amt_to_forward_msat: '1',
        chan_capacity: '1',
        chan_id: '1',
        custom_records: {},
        expiry: 1,
        fee_msat: '1',
        pub_key: Buffer.alloc(33, 3).toString('hex'),
      }],
      total_amt: 1,
      total_amt_msat: '1',
      total_fees: '1',
      total_fees_msat: '1',
      total_time_lock: 1,
    }],
    success_prob: 1,
  };
};
