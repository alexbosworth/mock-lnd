const {createHash} = require('node:crypto');
const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');
const {throws} = require('node:assert/strict');

const {getInvoice} = require('lightning');
const {parsePaymentRequest} = require('invoices');

const {makeInvoice} = require('./../../');
const {makeLnd} = require('./../../');

const bufferAsHex = buffer => buffer.toString('hex');
const isPast = date => Date.parse(date) < Date.now();
const keyAsType = n => Buffer.from(n, 'latin1').readBigUInt64LE().toString();
const {keys} = Object;
const requestFields = ['expires_at', 'id', 'mtokens', 'payment'];
const sha256 = n => createHash('sha256').update(n).digest('hex');
const types = ['1', '34349334', '9223372036854775808', '18446744073709551615'];

// Make an invoice and get the records of its first payment by their types
const recordsOf = args => {
  const [{custom_records: records}] = makeInvoice(args).htlcs;

  return keys(records).map(n => [keyAsType(n), bufferAsHex(records[n])]);
};

// Make an invoice and describe it as lightning gets it, with its request
const describeInvoice = async args => {
  const invoice = makeInvoice(args);

  const lnd = makeLnd({getInvoice: ({}, cbk) => cbk(null, invoice)});

  const got = await getInvoice({lnd, id: bufferAsHex(invoice.r_hash)});

  const request = parsePaymentRequest({request: got.request});

  return {
    features: got.features.map(n => n.bit),
    held: got.held_mtokens,
    is_canceled: !!got.is_canceled,
    is_confirmed: got.is_confirmed,
    is_expired: isPast(got.expires_at),
    is_held: !!got.is_held,
    is_preimage: sha256(invoice.r_preimage) === got.id,
    is_request: requestFields.every(n => request[n] === got[n]),
    payments: got.payments.map(n => [n.is_confirmed, n.mtokens]),
    received: got.received_mtokens,
    request_features: request.features.map(n => n.bit),
  };
};

// Make an invoice and get its description hash and the hash in its request
const descriptionHashesOf = args => {
  const invoice = makeInvoice(args);

  const request = parsePaymentRequest({request: invoice.payment_request});

  return [bufferAsHex(invoice.description_hash), request.description_hash];
};

const tests = [
  {
    args: {payments: [{messages: types.map(type => ({type, value: '0a'}))}]},
    description: 'Payment records are keyed by their uint64 types',
    expected: types.map(type => [type, '0a']),
    method: recordsOf,
  },
  {
    args: {},
    description: 'An invoice is open and unpaid by default, like LND makes',
    expected: {
      features: [8, 14, 17, 25],
      held: '0',
      is_canceled: false,
      is_confirmed: false,
      is_expired: false,
      is_held: false,
      is_preimage: true,
      is_request: true,
      payments: [],
      received: '0',
      request_features: [8, 14, 17, 25],
    },
    method: describeInvoice,
  },
  {
    args: {is_confirmed: true},
    description: 'An invoice can be confirmed',
    expected: {
      features: [8, 14, 17, 25],
      held: '0',
      is_canceled: false,
      is_confirmed: true,
      is_expired: false,
      is_held: false,
      is_preimage: true,
      is_request: true,
      payments: [],
      received: '1000',
      request_features: [8, 14, 17, 25],
    },
    method: describeInvoice,
  },
  {
    args: {is_canceled: true},
    description: 'An invoice can be canceled',
    expected: {
      features: [8, 14, 17, 25],
      held: '0',
      is_canceled: true,
      is_confirmed: false,
      is_expired: false,
      is_held: false,
      is_preimage: true,
      is_request: true,
      payments: [],
      received: '0',
      request_features: [8, 14, 17, 25],
    },
    method: describeInvoice,
  },
  {
    args: {payments: [{}, {}]},
    description: 'An invoice with payments is held, with the amount shared',
    expected: {
      features: [8, 14, 17, 25],
      held: '1000',
      is_canceled: false,
      is_confirmed: false,
      is_expired: false,
      is_held: true,
      is_preimage: true,
      is_request: true,
      payments: [[false, '500'], [false, '500']],
      received: '0',
      request_features: [8, 14, 17, 25],
    },
    method: describeInvoice,
  },
  {
    args: {is_canceled: true, payments: [{}]},
    description: 'A canceled invoice has its payments canceled',
    expected: {
      features: [8, 14, 17, 25],
      held: '0',
      is_canceled: true,
      is_confirmed: false,
      is_expired: false,
      is_held: false,
      is_preimage: true,
      is_request: true,
      payments: [[false, '1000']],
      received: '0',
      request_features: [8, 14, 17, 25],
    },
    method: describeInvoice,
  },
  {
    args: {description_hash: Buffer.alloc(32, 3).toString('hex')},
    description: 'An invoice can have a description hash in its request',
    expected: ['03'.repeat(32), '03'.repeat(32)],
    method: descriptionHashesOf,
  },
  {
    args: {is_canceled: true, is_confirmed: true},
    description: 'An invoice is not both canceled and confirmed',
    error: 'ExpectedInvoiceNotBothCanceledAndConfirmed',
    method: makeInvoice,
  },
];

tests.forEach(({args, description, error, expected, method}) => {
  test(description, async () => {
    if (!!error) {
      return throws(() => method(args), new Error(error), 'Got error');
    }

    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
