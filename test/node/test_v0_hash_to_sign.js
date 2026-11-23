const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');
const {throws} = require('node:assert/strict');

const {transactionFromComponents} = require('@alexbosworth/blockchain');
const {v0HashToSign} = require('@alexbosworth/blockchain');

const method = require('./../../node/v0_hash_to_sign');

const bip143Hash = 'c37af31116d1b27caf68aae9e3ac82f1477929014d5b917657d0eb49478cb670';
const bip143ScriptCode = '76a9141d0f172a0ecb48aee1be1f2687d2963ae33f71a188ac';
const bip143Transaction = '0100000002fff7f7881a8099afa6940d42d1e7f6362bec38171ea3edf433541db4e4ad969f0000000000eeffffffef51e1b804cc89d182d279655c3aa89e815b1b309fe287d9b2b55d57b90ec68a0100000000ffffffff02202cb206000000001976a9148280b37df378db99f66f85c95a783a76ac7a6d5988ac9093510d000000001976a9143bde42dbee7e4dbe6a21b2d50ce2f0167faa815988ac11000000';
const bufferAsHex = buffer => buffer.toString('hex');
const script = `21${'02'.repeat(33)}ac`;
const standardTypes = [0x01, 0x02, 0x03, 0x81, 0x82, 0x83];
const tokens = 2 ** 40 + 7;

// A transaction with more inputs than outputs, spending a large value
const transaction = transactionFromComponents({
  inputs: [
    {id: '11'.repeat(32), script: '', sequence: 0xfffffffd, vout: 1},
    {id: '22'.repeat(32), script: '', sequence: 7, vout: 0},
  ],
  locktime: 500,
  outputs: [{script: `0014${'33'.repeat(20)}`, tokens: 4000}],
  version: 2,
}).transaction;

// Calculate the hashes to sign for each input with each standard type, and
// check that they match the hashes of the blockchain library
const standardHashes = ({}) => [0, 1].every(vin => {
  return standardTypes.every(sighash => {
    const args = {script, sighash, tokens, transaction, vin};

    return bufferAsHex(method(args).hash) === v0HashToSign(args).hash;
  });
});

// Calculate the hashes to sign for a sighash type of zero and SIGHASH_ALL,
// which commit to the same parts of the transaction, and count them
const zeroTypeHashes = ({}) => {
  const hashes = [0, 1].map(sighash => {
    const args = {script, sighash, tokens, transaction, vin: 0};

    return bufferAsHex(method(args).hash);
  });

  return new Set(hashes).size;
};

const tests = [
  {
    args: {
      script: bip143ScriptCode,
      sighash: 1,
      tokens: 600000000,
      transaction: bip143Transaction,
      vin: 1,
    },
    description: 'The BIP 143 native P2WPKH example hash is calculated',
    expected: bip143Hash,
    method: args => bufferAsHex(method(args).hash),
  },
  {
    args: {},
    description: 'Standard sighash types are hashed as BIP 143 hashes them',
    expected: true,
    method: standardHashes,
  },
  {
    args: {},
    description: 'A sighash type of zero is committed to in the hash',
    expected: 2,
    method: zeroTypeHashes,
  },
  {
    args: {script, sighash: 1, tokens, transaction, vin: 2},
    description: 'The signing input is an input of the transaction',
    error: 'idx 2 but 2 txins',
    method,
  },
];

tests.forEach(({args, description, error, expected, method}) => {
  test(description, () => {
    if (!!error) {
      throws(() => method(args), new Error(error), 'Got expected error');
    } else {
      deepStrictEqual(method(args), expected, 'Got expected result');
    }
  });
});
