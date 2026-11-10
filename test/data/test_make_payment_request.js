const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {parsePaymentRequest} = require('invoices');
const {sign} = require('tiny-secp256k1');

const {makePaymentRequest} = require('./../../');

const destination = '03e7156ae33b0a208d0744199163177e909e80176e55d97a2f221ede0f934dd9ad';
const ecp = {fromPrivateKey: key => ({sign: hash => sign(hash, key)})};

// Make a payment request signed with an ECPair factory, and get its details
const requestOf = args => {
  const {request} = makePaymentRequest({...args, ecp});

  const parsed = parsePaymentRequest({request});

  return {destination: parsed.destination, mtokens: parsed.mtokens};
};

const tests = [
  {
    args: {mtokens: '2000'},
    description: 'A payment request is made and signed',
    expected: {destination, mtokens: '2000'},
  },
  {
    args: {},
    description: 'A payment request is for 1000 millitokens by default',
    expected: {destination, mtokens: '1000'},
  },
];

tests.forEach(({args, description, expected}) => {
  test(description, () => {
    deepStrictEqual(requestOf(args), expected, 'Got expected result');
  });
});
