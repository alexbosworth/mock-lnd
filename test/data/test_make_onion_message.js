const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {makeOnionMessage} = require('./../../');

const bufferAsHex = buffer => buffer.toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const key = Buffer.alloc(33, 2).toString('hex');
const keyAsType = n => Buffer.from(n, 'latin1').readBigUInt64LE().toString();
const {keys} = Object;

// Make an onion message and get its onion size, payload records and paths
const messageOf = args => {
  const message = makeOnionMessage(args);

  const records = message.custom_records;

  return {
    onion: message.onion.length,
    records: keys(records).map(n => [keyAsType(n), bufferAsHex(records[n])]),
    reply_path: message.reply_path,
  };
};

const tests = [
  {
    args: {
      key,
      encrypted: '01',
      message: {type: '64', value: '0a'},
      via: key,
    },
    description: 'An onion message has its payload keyed by its uint64 type',
    expected: {onion: 1366, records: [['64', '0a']], reply_path: undefined},
  },
  {
    args: {
      key,
      encrypted: '01',
      onion: '00'.repeat(10),
      reply: {
        key,
        inbound: [{encrypted_data: '03', relay_key: key}],
        introduction_node: key,
      },
      via: key,
    },
    description: 'An onion message can have an onion and a reply path',
    expected: {
      onion: 10,
      records: [],
      reply_path: {
        blinded_hops: [{
          blinded_node: hexAsBuffer(key),
          encrypted_data: hexAsBuffer('03'),
        }],
        blinding_point: hexAsBuffer(key),
        introduction_node: hexAsBuffer(key),
      },
    },
  },
];

tests.forEach(({args, description, expected}) => {
  test(description, () => {
    deepStrictEqual(messageOf(args), expected, 'Got expected result');
  });
});
