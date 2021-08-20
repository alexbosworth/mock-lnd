const makeBlocksSubscription = require('./make_blocks_subscription');
const {makeChainFeeRateResponse} = require('./../data');
const makeForwardsResponse = require('./../data/make_forwards_response');
const {makeFundPsbtResponse} = require('./../data');
const makeInvoice = require('./../data/make_invoice');
const makeInvoiceSubscription = require('./make_invoice_subscription');
const makePaySubscription = require('./make_pay_subscription');
const {makePayViaRoutesResponse} = require('./../data');
const {makeRoutesResponse} = require('./../data');
const {makeSignPsbtResponse} = require('./../data');
const {makeWalletInfoResponse} = require('./../data');
const {makeWalletVersionResponse} = require('./../data');

const bufAsHex = buf => buf.toString('hex');

/** Make an LND mock object for testing

  {
    fundPsbt: <Override Fund PSBT Function>
    getForwards: <Override Get Forwards Response Function>
    getInvoice: <Override Get Invoice Response Function>
    getWalletVersion: <Override Get Wallet Version Response Function>
    payViaRoutes: <Override Pay Via Routes Function>
    subscribeToInvoice: <Override Subscribe to Invoice Emitter>
    subscribeToPay: <Override Subscribe to Pay Emitter>
  }

  @returns
  {
    chain: {
      registerBlockEpochNtfn: ({}) => {}
    }
    default: {
      addInvoice: ({}, cbk) => {}
      getInfo: ({}, cbk) => {}
      lookupInvoice: ({}, cbk) => {}
      queryRoutes: ({}, cbk) => {}
    }
    invoices: {
      subscribeSingleInvoice: ({}) => {}
    }
    router: {
      sendPaymentV2: ({}) => {}
    }
    version: {
      getVersion: ({}) => {}
    }
    wallet: {
      estimateFee: ({}) => {}
      finalizePsbt: ({}) => {}
      fundPsbt: ({}) => {}
      releaseOutput: ({}) => {}
    }
  }
*/
module.exports = overrides => {
  return {
    chain: {
      registerBlockEpochNtfn: ({}) => {
        return makeBlocksSubscription({})
      },
    },
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
      getInfo: (args, cbk) => {
        return cbk(null, makeWalletInfoResponse({}));
      },
      lookupInvoice: (args, cbk) => {
        // Exit early when there is a custom invoice response
        if (!!overrides.getInvoice) {
          return overrides.getInvoice({id: bufAsHex(args.r_hash)}, cbk);
        }

        return cbk(null, makeInvoice({}));
      },
      queryRoutes: ({}, cbk) => {
        return cbk(null, makeRoutesResponse({}));
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
      sendPaymentV2: ({}) => {
        // Exit early when there is a custom payment subscription
        if (!!overrides.subscribeToPay) {
          return overrides.subscribeToPay;
        }

        return makePaySubscription({});
      },
      sendToRoute: (args, cbk) => {
        // Exit early when overriding the send to route
        if (!!overrides.payViaRoutes) {
          return overrides.payViaRoutes(args, cbk);
        }

        return cbk(null, makePayViaRoutesResponse({}));
      },
    },
    version: {
      getVersion: ({}, cbk) => {
        if (!!overrides.getWalletVersion) {
          return overrides.getWalletVersion({}, cbk);
        }

        return cbk(null, makeWalletVersionResponse({}));
      },
    },
    wallet: {
      estimateFee: ({}, cbk) => {
        return cbk(null, makeChainFeeRateResponse({}));
      },
      finalizePsbt: (args, cbk) => {
        if (!!overrides.signPsbt) {
          return overrides.signPsbt({}, cbk);
        }

        return cbk(null, makeSignPsbtResponse({}));
      },
      fundPsbt: (args, cbk) => {
        if (!!overrides.fundPsbt) {
          return overrides.fundPsbt({}, cbk);
        }

        return cbk(null, makeFundPsbtResponse({}));
      },
      releaseOutput: ({}, cbk) => cbk(),
    },
  };
};
