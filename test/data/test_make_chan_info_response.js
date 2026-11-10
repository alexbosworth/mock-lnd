const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const method = require('./../../data/make_chan_info_response');

const greater = Buffer.alloc(33, 3).toString('hex');
const lesser = Buffer.alloc(33, 2).toString('hex');
const noTxId = Buffer.alloc(32).toString('hex');
const txId = Buffer.alloc(32, 1).toString('hex');

// The values of a policy that have defaults when they are not given
const policyValues = policy => [
  policy.fee_base_msat,
  policy.fee_rate_milli_msat,
  policy.max_htlc_msat,
  policy.min_htlc,
  policy.time_lock_delta,
];

// Make a channel edge and get its nodes with the values of their policies
const edgeNodes = args => {
  const edge = method(args);

  return {
    chan_point: edge.chan_point,
    node1: [edge.node1_pub, policyValues(edge.node1_policy)],
    node2: [edge.node2_pub, policyValues(edge.node2_policy)],
  };
};

const tests = [
  {
    args: {
      channel: {
        id: '1x1x1',
        policies: [
          {cltv_delta: 144, public_key: greater},
          {cltv_delta: 40, public_key: lesser},
        ],
        transaction_id: txId,
        transaction_vout: 2,
      },
    },
    description: 'The first node of a channel edge has the lesser public key',
    expected: {
      chan_point: `${txId}:2`,
      node1: [lesser, ['1000', '1', '1000', '1000', 40]],
      node2: [greater, ['1000', '1', '1000', '1000', 144]],
    },
  },
  {
    args: {
      channel: {
        id: '1x1x1',
        policies: [
          {
            base_fee_mtokens: '0',
            cltv_delta: 0,
            fee_rate: 0,
            max_htlc_mtokens: '0',
            min_htlc_mtokens: '0',
            public_key: lesser,
          },
          {public_key: greater},
        ],
      },
    },
    description: 'Zero values are kept and missing values have defaults',
    expected: {
      chan_point: `${noTxId}:0`,
      node1: [lesser, ['0', '0', '0', '0', 0]],
      node2: [greater, ['1000', '1', '1000', '1000', 40]],
    },
  },
];

tests.forEach(({args, description, expected}) => {
  test(description, () => {
    deepStrictEqual(edgeNodes(args), expected, 'Got expected result');
  });
});
