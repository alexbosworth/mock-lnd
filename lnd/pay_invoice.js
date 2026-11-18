const fakeNodes = require('./fake_nodes');
const {invoiceStreams} = require('./../node');
const {makeGetChannelsResponse} = require('./../data');
const {updateInvoiceStreams} = require('./../node');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const currentSeconds = () => String(Math.floor(Date.now() / 1e3));
const isHash = n => typeof n === 'string' && /^[0-9A-F]{64}$/i.test(n);
const isNumeric = n => typeof n === 'string' && /^\d+$/.test(n);
const isPast = seconds => seconds * 1e3 < Date.now();
const mtokensPerToken = BigInt(1e3);
const noChannel = '0';
const openState = 'OPEN';
const settledState = 'SETTLED';

/** Pay an invoice of a fake LND, as when the node receives a payment for it

  The invoice is settled with an HTLC over the first channel of the node, and
  the invoice streams of the node are updated with the settled invoice

  Like LND, an invoice is not paid with less than its amount, or after it has
  expired

  {
    [id]: <Invoice Payment Hash Hex String>
    [index]: <Invoice Add Index Number>
    lnd: <Fake LND Object>
    [mtokens]: <Received Millitokens String>
  }

  @throws
  <Error>
*/
module.exports = ({id, index, lnd, mtokens}) => {
  const node = fakeNodes.get(lnd);

  if (!node) {
    throw new Error('ExpectedFakeLndToPayInvoice');
  }

  if (!id && index === undefined) {
    throw new Error('ExpectedInvoiceIdOrIndexToPayInvoice');
  }

  if (!!id && !isHash(id)) {
    throw new Error('ExpectedPaymentHashHexStringToPayInvoice');
  }

  if (mtokens !== undefined && !isNumeric(mtokens)) {
    throw new Error('ExpectedNumericMillitokensToPayInvoice');
  }

  // An invoice is found by its payment hash, or else by its add index
  const position = node.invoices.findIndex(invoice => {
    if (!!id) {
      return bufferAsHex(invoice.r_hash) === id.toLowerCase();
    }

    return invoice.add_index === String(index);
  });

  if (position === -1) {
    throw new Error('ExpectedKnownInvoiceToPayInvoice');
  }

  const invoice = node.invoices[position];

  if (invoice.state !== openState) {
    throw new Error('ExpectedOpenInvoiceToPayInvoice');
  }

  const expiresAt = Number(invoice.creation_date) + Number(invoice.expiry);

  // LND does not take payments for invoices that have expired
  if (isPast(expiresAt)) {
    throw new Error('ExpectedUnexpiredInvoiceToPayInvoice');
  }

  const received = BigInt(mtokens || invoice.value_msat);

  if (!received) {
    throw new Error('ExpectedMillitokensToPayInvoiceWithoutAmount');
  }

  // LND does not settle an invoice that is paid less than its amount
  if (received < BigInt(invoice.value_msat)) {
    throw new Error('ExpectedMillitokensOfAtLeastInvoiceAmountToPayInvoice');
  }

  const {channels} = makeGetChannelsResponse({channels: node.channels});
  const [tip] = node.chain.blocks.slice(-1);
  const now = currentSeconds();
  const settled = node.invoices.filter(n => n.state === settledState);
  const tokens = (received / mtokensPerToken).toString();

  const [channel] = channels;

  const paid = {
    ...invoice,
    amt_paid: tokens,
    amt_paid_msat: received.toString(),
    amt_paid_sat: tokens,
    htlcs: [{
      // The payment is accepted at the chain tip
      accept_height: tip.height,
      accept_time: now,
      amt_msat: received.toString(),
      chan_id: !channel ? noChannel : channel.chan_id,
      custom_records: {},
      expiry_height: tip.height + Number(invoice.cltv_expiry),
      htlc_index: '0',
      mpp_total_amt_msat: received.toString(),
      resolve_time: now,
      state: settledState,
    }],
    settle_date: now,
    settle_index: String(settled.length + 1),
    settled: true,
    state: settledState,
  };

  node.invoices[position] = paid;

  const {streams} = invoiceStreams({node, hash: paid.r_hash});

  return updateInvoiceStreams({streams, invoice: paid});
};
