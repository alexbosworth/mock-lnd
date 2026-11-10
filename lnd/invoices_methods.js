const makeInvoiceSubscription = require('./make_invoice_subscription');
const makeStream = require('./make_stream');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const {nextTick} = process;

/** Make the methods of the invoices sub-server of a fake node

  A subscription to an invoice that the node made starts with the invoice as
  it is, like LND, and is updated when it is paid. A subscription to another
  invoice gets a default invoice.

  {
    node: <Fake Node Object>
    overrides: <Method Overrides Object>
  }

  @returns
  {
    <Method Name String>: <RPC Method Function>
  }
*/
module.exports = ({node, overrides}) => {
  // The invoice that the node made with a hash
  const invoiceWithHash = hash => node.invoices.find(invoice => {
    return bufferAsHex(invoice.r_hash) === hash;
  });

  return {
    subscribeSingleInvoice: args => {
      // Exit early when there is a custom invoice subscription
      if (!!overrides.subscribeToInvoice) {
        return overrides.subscribeToInvoice;
      }

      const hash = !!args && !!args.r_hash ? bufferAsHex(args.r_hash) : '';

      // Exit early when the invoice is not an invoice that the node made
      if (!invoiceWithHash(hash)) {
        return makeInvoiceSubscription({});
      }

      const stream = makeStream({});

      nextTick(() => stream.emit('data', invoiceWithHash(hash)));

      return stream;
    },
  };
};
