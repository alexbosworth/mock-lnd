const makePaySubscription = require('./make_pay_subscription');
const {makePayViaRoutesResponse} = require('./../data');

/** Make the methods of the router sub-server of a fake node

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
    sendPaymentV2: ({}) => {
      // Exit early when there is a custom payment subscription
      if (!!overrides.subscribeToPay) {
        return overrides.subscribeToPay;
      }

      return makePaySubscription({});
    },
    sendToRouteV2: (args, cbk) => {
      // Exit early when overriding the send to route
      if (!!overrides.payViaRoutes) {
        return overrides.payViaRoutes(args, cbk);
      }

      return cbk(null, makePayViaRoutesResponse({}));
    },
  };
};
