const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');
const {throws} = require('node:assert/strict');

const {requestAsSent} = require('./../../protos');

// Send a sign request for a spent value, and get the value that LND gets
const sentValue = ({value}) => {
  const {request} = requestAsSent({
    method: 'signOutputRaw',
    request: {sign_descs: [{output: {value}}]},
    type: 'signer',
  });

  const [desc] = request.sign_descs;

  return desc.output.value;
};

const tests = [
  {
    args: {value: 5000},
    description: 'A number value is sent as its tokens',
    expected: '5000',
  },
  {
    args: {value: 5000.75},
    description: 'A fraction of a value is dropped',
    expected: '5000',
  },
  {
    args: {value: -0.5},
    description: 'A fraction is dropped toward zero',
    expected: '0',
  },
  {
    args: {value: {high: 0, low: 5000}},
    description: 'A protobuf long value is sent as its number',
    expected: '5000',
  },
  {
    args: {value: {high: 1, low: 5000}},
    description: 'The high bits of a protobuf long value are sent',
    expected: '4294972296',
  },
  {
    args: {value: '5000'},
    description: 'A string value is sent as its number',
    expected: '5000',
  },
  {
    args: {value: 5000n},
    description: 'A bigint value is sent as its number',
    expected: '5000',
  },
  {
    args: {value: undefined},
    description: 'A missing value is sent as zero',
    expected: '0',
  },
  {
    args: {value: ''},
    description: 'An empty value string cannot be sent',
    error: 'empty string',
  },
  {
    args: {value: '1-2'},
    description: 'A value string with an interior hyphen cannot be sent',
    error: 'interior hyphen',
  },
];

tests.forEach(({args, description, error, expected}) => {
  test(description, () => {
    if (!!error) {
      throws(() => sentValue(args), new Error(error), 'Got expected error');
    } else {
      deepStrictEqual(sentValue(args), expected, 'Got expected result');
    }
  });
});
