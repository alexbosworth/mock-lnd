/** Make a response for send to route

  {
    [is_unknown_failure]: <Route is Failed Bool>
  }

  @returns
  <Paid Via Routes Response Object>
*/
module.exports = args => {
  // Exit early when this is an unknown failure response
  if (!!args.is_unknown_failure) {
    return {
      attempt_id: '1',
      attempt_time_ns: '1',
      failure: {
        chan_id: '1',
        code: 'UNKNOWN_FAILURE',
        failure_source_index: 1,
      },
      preimage: Buffer.alloc(Number()),
      resolve_time_ns: '1',
      route: {
        hops: [{
          amt_to_forward_msat: '1000',
          chan_id: '1',
          chan_capacity: 1,
          expiry: 1,
          fee_msat: '1000',
          mpp_record: {payment_addr: Buffer.alloc(1), total_amt_msat: '1'},
          pub_key: 'a',
          tlv_payload: true,
        }],
        total_amt_msat: '1000',
        total_fees_msat: '1000',
        total_time_lock: 1,
      },
      status: 'FAILED',
    };
  }

  return {
    attempt_id: '1',
    attempt_time_ns: '1',
    preimage: Buffer.alloc(32),
    resolve_time_ns: '1',
    route: {
      hops: [{
        amt_to_forward_msat: '1000',
        chan_id: '1',
        chan_capacity: 1,
        expiry: 1,
        fee_msat: '1000',
        mpp_record: {payment_addr: Buffer.alloc(1), total_amt_msat: '1'},
        pub_key: 'a',
        tlv_payload: true,
      }],
      total_amt_msat: '1000',
      total_fees_msat: '1000',
      total_time_lock: 1,
    },
    status: 'SUCCEEDED',
  };
};
