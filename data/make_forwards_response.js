/** Make a forwardingHistory response

  {
    offset: <Paging Offset Number>
  }
*/
module.exports = args => {
  // Exit early when paging
  if (args.offset !== 0) {
    return {forwarding_events: [], last_offset_index: '1'};
  }

  return {
    forwarding_events: [{
      amt_in: '2',
      amt_in_msat: '2000',
      amt_out: '1',
      amt_out_msat: '1000',
      chan_id_in: '1',
      chan_id_out: '2',
      fee: '1',
      fee_msat: '1000',
      timestamp: Math.round(Date.now() / 1e3).toString(),
      timestamp_ns: Math.round(Date.now() / 1e3 * 1e9).toString(),
    }],
    last_offset_index: '1',
  };
};
