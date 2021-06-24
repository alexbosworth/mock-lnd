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
      failure: {
        chan_id: '1',
        code: 'UNKNOWN_FAILURE',
        failure_source_index: 1,
      },
      preimage: Buffer.alloc(Number()),
    };
  }

  return {preimage: Buffer.alloc(32)};
};
