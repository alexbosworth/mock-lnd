const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');

/** Get the invoice streams of a fake node that get updates of an invoice, as
  LND tells subscriptions about an invoice when it is added or settled

  Streams of every invoice get the invoice, and streams of a single invoice
  get the invoice when it is their invoice

  {
    hash: <Invoice Payment Hash Buffer Object>
    node: {
      streams: [{
        args: <RPC Arguments Object>
        method: <RPC Method Name String>
        subscription: <Stream EventEmitter Object>
        type: <Sub-Server Type String>
      }]
    }
  }

  @returns
  {
    streams: [<Stream EventEmitter Object>]
  }
*/
module.exports = ({hash, node}) => {
  const id = bufferAsHex(hash);

  const streams = node.streams
    .filter(({args, method, type}) => {
      // Streams of all invoices get every invoice
      if (type === 'default' && method === 'subscribeInvoices') {
        return true;
      }

      // Streams of a single invoice get the invoice with their hash
      if (type !== 'invoices' || method !== 'subscribeSingleInvoice') {
        return false;
      }

      return !!args && !!args.r_hash && bufferAsHex(args.r_hash) === id;
    })
    .map(n => n.subscription)
    .filter(stream => !!stream);

  return {streams};
};
