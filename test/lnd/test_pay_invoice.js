const {deepStrictEqual} = require('node:assert/strict');
const {mock} = require('node:test');
const {rejects} = require('node:assert/strict');
const {test} = require('node:test');

const {createInvoice} = require('lightning');
const {getInvoice} = require('lightning');
const {subscribeToInvoice} = require('lightning');
const {subscribeToInvoices} = require('lightning');

const {makeLnd} = require('./../../');
const {payInvoice} = require('./../../');

const futureDate = ms => new Date(Date.now() + ms).toISOString();
const futureMs = ms => Date.now() + ms;
const key = Buffer.alloc(33, 2).toString('hex');
const nextTick = () => new Promise(resolve => setImmediate(resolve));
const unknown = Buffer.alloc(32).toString('hex');

// Pay an invoice, and get the message of the error that paying fails with
const payError = args => {
  try {
    payInvoice(args);

    return null;
  } catch (err) {
    return err.message;
  }
};

// Create an invoice with a strict fake LND, pay it, and get the paid invoice
// with the updates that a stream of invoices got
const payCreated = async ({mtokens}) => {
  const lnd = makeLnd({is_strict: true});
  const updates = [];

  const sub = subscribeToInvoices({lnd});

  sub.on('invoice_updated', n => updates.push(n));

  const {id} = await createInvoice({lnd, mtokens});

  await nextTick();

  payInvoice({id, lnd});

  const invoice = await getInvoice({id, lnd});

  sub.removeAllListeners();

  return {
    confirmed_index: invoice.confirmed_index,
    is_confirmed: invoice.is_confirmed,
    payments: invoice.payments.map(n => {
      return [n.in_channel, n.is_confirmed, n.mtokens];
    }),
    received_mtokens: invoice.received_mtokens,
    updates: updates.map(n => [n.id === id, n.is_confirmed]),
  };
};

// Create two invoices without amounts, pay them by their add indexes, and
// get the paid invoices
const payByIndexes = async ({payments}) => {
  const lnd = makeLnd({
    channels: [{id: '1x2x3', partner_public_key: key}],
    is_strict: true,
  });

  const first = await createInvoice({lnd});

  const second = await createInvoice({lnd});

  payments.forEach(({index, mtokens}) => payInvoice({index, lnd, mtokens}));

  const paidFirst = await getInvoice({lnd, id: first.id});
  const paidSecond = await getInvoice({lnd, id: second.id});

  return [paidFirst, paidSecond].map(invoice => ({
    confirmed_index: invoice.confirmed_index,
    in_channels: invoice.payments.map(n => n.in_channel),
    received_mtokens: invoice.received_mtokens,
  }));
};

// Create an invoice, subscribe to it, pay it, and get the updates to it
const singleUpdates = async ({}) => {
  const lnd = makeLnd({is_strict: true});
  const updates = [];

  const {id} = await createInvoice({lnd, mtokens: '1000'});

  const sub = subscribeToInvoice({id, lnd});

  sub.on('invoice_updated', n => updates.push(n.is_confirmed));

  await nextTick();

  payInvoice({id, lnd});

  sub.removeAllListeners();

  return updates;
};

// Create an invoice, pay it by its id in uppercase, and get if it is paid
const payByUppercaseId = async ({}) => {
  const lnd = makeLnd({});

  const {id} = await createInvoice({lnd, tokens: 1});

  payInvoice({lnd, id: id.toUpperCase()});

  return (await getInvoice({id, lnd})).is_confirmed;
};

// Pay an invoice less than its amount, and then more than its amount, and
// get the errors of paying, and what the invoice received
const payLessThenMore = async ({}) => {
  const lnd = makeLnd({});

  const {id} = await createInvoice({lnd, mtokens: '5000'});

  const less = payError({id, lnd, mtokens: '4999'});

  const more = payError({id, lnd, mtokens: '6000'});

  const invoice = await getInvoice({id, lnd});

  return {less, more, received: invoice.received_mtokens};
};

// Pay an invoice after it expires, and get the error and if it is paid
const payExpired = async ({}) => {
  const lnd = makeLnd({});

  const {id} = await createInvoice({
    lnd,
    expires_at: futureDate(1000 * 60),
    tokens: 1,
  });

  // Time moves past the expiry of the invoice
  mock.timers.enable({apis: ['Date'], now: futureMs(1000 * 60 * 2)});

  try {
    const error = payError({id, lnd});

    const invoice = await getInvoice({id, lnd});

    return {error, is_confirmed: invoice.is_confirmed};
  } finally {
    mock.timers.reset();
  }
};

// Create an invoice without an amount, and pay it with a request that is
// made from the invoice id and the fake LND
const payRequest = async args => {
  const lnd = makeLnd({});

  const {id} = await createInvoice({lnd});

  // The invoice can be paid before the request to pay it
  if (!!args.is_paid) {
    payInvoice({id, lnd, mtokens: '1'});
  }

  return payInvoice(args.request({id, lnd}));
};

const tests = [
  {
    args: {mtokens: '1000'},
    description: 'An invoice is paid like LND receives a payment for it',
    expected: {
      confirmed_index: 1,
      is_confirmed: true,
      payments: [['0x0x1', true, '1000']],
      received_mtokens: '1000',
      updates: [[true, false], [true, true]],
    },
    method: payCreated,
  },
  {
    args: {
      payments: [{index: 2, mtokens: '5000'}, {index: 1, mtokens: '1000'}],
    },
    description: 'An invoice without an amount is paid by its index',
    expected: [
      {confirmed_index: 2, in_channels: ['1x2x3'], received_mtokens: '1000'},
      {confirmed_index: 1, in_channels: ['1x2x3'], received_mtokens: '5000'},
    ],
    method: payByIndexes,
  },
  {
    args: {},
    description: 'A subscription to an invoice is told when it is paid',
    expected: [false, true],
    method: singleUpdates,
  },
  {
    args: {},
    description: 'An invoice is paid by its id in uppercase',
    expected: true,
    method: payByUppercaseId,
  },
  {
    args: {},
    description: 'An invoice is not paid less than its amount, like LND',
    expected: {
      less: 'ExpectedMillitokensOfAtLeastInvoiceAmountToPayInvoice',
      more: null,
      received: '6000',
    },
    method: payLessThenMore,
  },
  {
    args: {},
    description: 'An invoice is not paid after it expires, like LND',
    expected: {
      error: 'ExpectedUnexpiredInvoiceToPayInvoice',
      is_confirmed: false,
    },
    method: payExpired,
  },
  {
    args: {request: ({id}) => ({id, lnd: {}})},
    description: 'A fake LND is expected',
    error: 'ExpectedFakeLndToPayInvoice',
    method: payRequest,
  },
  {
    args: {request: ({lnd}) => ({lnd})},
    description: 'An invoice id or index is expected',
    error: 'ExpectedInvoiceIdOrIndexToPayInvoice',
    method: payRequest,
  },
  {
    args: {request: ({lnd}) => ({lnd, id: 'id'})},
    description: 'An invoice id is a payment hash',
    error: 'ExpectedPaymentHashHexStringToPayInvoice',
    method: payRequest,
  },
  {
    args: {request: ({id, lnd}) => ({id, lnd, mtokens: 1000})},
    description: 'Millitokens are a numeric string',
    error: 'ExpectedNumericMillitokensToPayInvoice',
    method: payRequest,
  },
  {
    args: {request: ({lnd}) => ({lnd, id: unknown})},
    description: 'An invoice is expected to be an invoice of the node',
    error: 'ExpectedKnownInvoiceToPayInvoice',
    method: payRequest,
  },
  {
    args: {request: ({lnd}) => ({lnd, index: 2})},
    description: 'An invoice index is expected to be an index of the node',
    error: 'ExpectedKnownInvoiceToPayInvoice',
    method: payRequest,
  },
  {
    args: {request: ({id, lnd}) => ({id, lnd})},
    description: 'An invoice without an amount is paid with an amount',
    error: 'ExpectedMillitokensToPayInvoiceWithoutAmount',
    method: payRequest,
  },
  {
    args: {is_paid: true, request: ({id, lnd}) => ({id, lnd, mtokens: '1'})},
    description: 'An invoice that is paid cannot be paid again',
    error: 'ExpectedOpenInvoiceToPayInvoice',
    method: payRequest,
  },
];

tests.forEach(({args, description, error, expected, method}) => {
  test(description, async () => {
    if (!!error) {
      const failing = async () => method(args);

      return await rejects(failing, new Error(error), 'Got expected error');
    }

    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
