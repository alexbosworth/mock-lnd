const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {makeRpcError} = require('./../../');

// Make an error and get what a gRPC client error from LND has
const errorOf = args => {
  const err = makeRpcError(args);

  return {
    code: err.code,
    details: err.details,
    is_error: err instanceof Error,
    message: err.message,
    metadata: err.metadata,
  };
};

const tests = [
  {
    args: {details: 'edge not found'},
    description: 'An error is made like a gRPC client error from LND',
    expected: {
      code: 2,
      details: 'edge not found',
      is_error: true,
      message: '2 UNKNOWN: edge not found',
      metadata: {},
    },
  },
  {
    args: {code: 12, details: 'unknown method'},
    description: 'An error has the name of its gRPC status code',
    expected: {
      code: 12,
      details: 'unknown method',
      is_error: true,
      message: '12 UNIMPLEMENTED: unknown method',
      metadata: {},
    },
  },
  {
    args: {code: 13, details: 'serialization failure'},
    description: 'An internal error has the name of its gRPC status code',
    expected: {
      code: 13,
      details: 'serialization failure',
      is_error: true,
      message: '13 INTERNAL: serialization failure',
      metadata: {},
    },
  },
];

tests.forEach(({args, description, expected}) => {
  test(description, () => {
    deepStrictEqual(errorOf(args), expected, 'Got expected result');
  });
});
