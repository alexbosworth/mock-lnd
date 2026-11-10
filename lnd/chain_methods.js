const makeBlocksSubscription = require('./make_blocks_subscription');

/** Make the methods of the chain notifier sub-server of a fake node

  {}

  @returns
  {
    <Method Name String>: <RPC Method Function>
  }
*/
module.exports = ({}) => {
  return {
    registerBlockEpochNtfn: ({}) => makeBlocksSubscription({}),
  };
};
