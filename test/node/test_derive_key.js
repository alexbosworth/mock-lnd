const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {pointFromScalar} = require('tiny-secp256k1');

const deriveKey = require('./../../node/derive_key');

const given = Buffer.alloc(32, 3);
const keyOf = secret => Buffer.from(pointFromScalar(secret, true));
const otherSecret = Buffer.alloc(32, 2);
const secret = Buffer.alloc(32, 1);

// Derive keys and count the distinct public keys that are derived
const distinctKeys = ({derivations}) => {
  const keys = derivations.map(n => deriveKey({...n, keys: []}).public_key);

  return new Set(keys.map(n => n.toString('hex'))).size;
};

const tests = [
  {
    args: {secret, family: 6, index: 0, keys: []},
    description: 'The identity key is the node secret',
    expected: {private_key: secret, public_key: keyOf(secret)},
    method: deriveKey,
  },
  {
    args: {
      derivations: [
        {secret, family: 805, index: 0},
        {secret, family: 805, index: 0},
      ],
    },
    description: 'Keys are derived from the node secret and locator',
    expected: 1,
    method: distinctKeys,
  },
  {
    args: {
      derivations: [
        {secret, family: 805, index: 0},
        {secret, family: 805, index: 1},
        {secret, family: 806, index: 0},
        {family: 805, index: 0, secret: otherSecret},
      ],
    },
    description: 'Keys at other locators or of other secrets are different',
    expected: 4,
    method: distinctKeys,
  },
  {
    args: {
      secret,
      family: 6,
      index: 0,
      keys: [{family: 6, index: 0, secret: given.toString('hex')}],
    },
    description: 'Given keys are used at their locators',
    expected: {private_key: given, public_key: keyOf(given)},
    method: deriveKey,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, () => {
    deepStrictEqual(method(args), expected, 'Got expected result');
  });
});
