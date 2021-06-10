const makeForwardsResponse = require('./../data/make_forwards_response');
const makeInvoice = require('./../data/make_invoice');
const makeInvoiceSubscription = require('./make_invoice_subscription');
const makePaySubscription = require('./make_pay_subscription');

const bufAsHex = buf => buf.toString('hex');

/** Make an LND mock object for testing

  {
    getForwards: <Override Get Forwards Response Function>
    getInvoice: <Override Get Invoice Response Function>
    subscribeToInvoice: <Override Subscribe to Invoice Emitter>
    subscribeToPay: <Override Subscribe to Pay Emitter>
  }

  @returns
  {
    default: {
      addInvoice: ({}, cbk) => {}
      lookupInvoice: ({}, cbk) => {}
    }
    invoices: {
      subscribeSingleInvoice: ({}) => {}
    }
    router: {
      sendPaymentV2: ({}) => {}
    }
  }
*/
module.exports = overrides => {
  return {
    default: {
      addInvoice: ({}, cbk) => {
        return cbk(null, makeInvoice({}));
      },
      forwardingHistory: (args, cbk) => {
        // Exit early when there is a custom forwards response
        if (!!overrides.getForwards) {
          return overrides.getForwards({offset: args.index_offset}, cbk);
        }

        return cbk(null, makeForwardsResponse({offset: args.index_offset}));
      },
      lookupInvoice: (args, cbk) => {
        // Exit early when there is a custom invoice response
        if (!!overrides.getInvoice) {
          return overrides.getInvoice({id: bufAsHex(args.r_hash)}, cbk);
        }

        return cbk(null, makeInvoice({}));
      },
    },
    invoices: {
      subscribeSingleInvoice: ({}) => {
        // Exit early when there is a custom invoice subscription
        if (!!overrides.subscribeToInvoice) {
          return overrides.subscribeToInvoice;
        }

        return makeInvoiceSubscription({});
      },
    },
    router: {
      sendPaymentV2: args => {
        // Exit early when there is a custom payment subscription
        if (!!overrides.subscribeToPay) {
          return overrides.subscribeToPay;
        }

        return makePaySubscription({});
      },
    },
  };
};
