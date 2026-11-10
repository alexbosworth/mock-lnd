const {makeWalletVersionResponse} = require('./../data');

/** Make the methods of the versioner sub-server of a fake node

  {
    overrides: <Method Overrides Object>
  }

  @returns
  {
    <Method Name String>: <RPC Method Function>
  }
*/
module.exports = ({overrides}) => {
  return {
    getVersion: ({}, cbk) => {
      // Exit early when there is a custom version response
      if (!!overrides.getWalletVersion) {
        return overrides.getWalletVersion({}, cbk);
      }

      return cbk(null, makeWalletVersionResponse({}));
    },
  };
};
