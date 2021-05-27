const makeInvoice = require('./../data/make_invoice');
const makeInvoiceSubscription = require('./make_invoice_subscription');
const makePaySubscription = require('./make_pay_subscription');

const bufAsHex = buf => buf.toString('hex');

/** Make an LND mock object for testing

  {
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
      lookupInvoice: (args, cbk) => {
        if (!!overrides.getInvoice) {
          return overrides.getInvoice({id: bufAsHex(args.r_hash)}, cbk);
        }

        return cbk(null, makeInvoice({}));
      },
    },
    invoices: {
      subscribeSingleInvoice: ({}) => {
        if (!!overrides.subscribeToInvoice) {
          return overrides.subscribeToInvoice;
        }

        return makeInvoiceSubscription({});
      },
    },
    router: {
      sendPaymentV2: args => {
        if (!!overrides.subscribeToPay) {
          return overrides.subscribeToPay;
        }

        return makePaySubscription({});
      },
    },
  };
};
