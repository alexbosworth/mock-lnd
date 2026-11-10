const {createHash} = require('node:crypto');
const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {parsePaymentRequest} = require('invoices');
const {pointFromScalar} = require('tiny-secp256k1');

const makeInvoice = require('./../../node/make_invoice');

const bufferAsHex = buffer => buffer.toString('hex');
const descriptionHash = Buffer.alloc(32, 7);
const preimage = Buffer.alloc(32, 9);
const secret = Buffer.alloc(32, 1);
const sha256 = n => createHash('sha256').update(n).digest('hex');

// Make arguments to make an invoice for a request with the default node
const makeArgs = request => {
  const identity = Buffer.from(pointFromScalar(secret, true)).toString('hex');

  return {
    identity,
    request,
    secret,
    add_index: 1,
    channels: [],
    network: 'mainnet',
    private_key: secret,
  };
};

// Make an invoice for a request and describe it with its payment request
const invoiceOf = request => {
  const {invoice} = makeInvoice(makeArgs(request));

  const parsed = parsePaymentRequest({request: invoice.payment_request});

  return {
    description_hash: bufferAsHex(invoice.description_hash),
    hash: bufferAsHex(invoice.r_hash),
    preimage: bufferAsHex(invoice.r_preimage),
    request_description_hash: parsed.description_hash,
    request_mtokens: parsed.mtokens,
    request_network: parsed.network,
    state: invoice.state,
    value_msat: invoice.value_msat,
  };
};

// Make invoices at add indexes and count the distinct preimages of them
const distinctPreimages = ({indexes}) => {
  const preimages = indexes.map(index => {
    return makeInvoice({...makeArgs({}), add_index: index}).invoice.r_preimage;
  });

  return new Set(preimages.map(bufferAsHex)).size;
};

const tests = [
  {
    args: {r_preimage: preimage, value: '2'},
    description: 'An invoice is made for a preimage',
    expected: {
      description_hash: '',
      hash: sha256(preimage),
      preimage: bufferAsHex(preimage),
      request_description_hash: undefined,
      request_mtokens: '2000',
      request_network: 'bitcoin',
      state: 'OPEN',
      value_msat: '2000',
    },
    method: invoiceOf,
  },
  {
    args: {description_hash: descriptionHash, r_preimage: preimage},
    description: 'An invoice can have a description hash',
    expected: {
      description_hash: bufferAsHex(descriptionHash),
      hash: sha256(preimage),
      preimage: bufferAsHex(preimage),
      request_description_hash: bufferAsHex(descriptionHash),
      request_mtokens: '0',
      request_network: 'bitcoin',
      state: 'OPEN',
      value_msat: '0',
    },
    method: invoiceOf,
  },
  {
    args: {indexes: [1, 1]},
    description: 'Preimages are derived from the node secret and add index',
    expected: 1,
    method: distinctPreimages,
  },
  {
    args: {indexes: [1, 2]},
    description: 'Invoices at other add indexes have other preimages',
    expected: 2,
    method: distinctPreimages,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, () => {
    deepStrictEqual(method(args), expected, 'Got expected result');
  });
});
