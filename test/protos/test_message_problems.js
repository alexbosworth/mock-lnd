const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const lndProtos = require('./../../protos/lnd_protos');
const {messageProblems} = require('./../../protos');
const {rpcDetails} = require('./../../protos');
const {rpcResponseProblems} = require('./../../protos');

const firstPeer = 'default.listPeers.peers[0]';
const key = Buffer.alloc(33, 2).toString('hex');
const records = 'default.subscribeOnionMessages.custom_records';
const typeKey = Buffer.from('4000000000000000', 'hex').toString('latin1');

// Get the problems of a message of the FeeLimit type, which has a oneof
const feeLimitProblems = ({message}) => {
  const type = lndProtos({}).root.lookupType('lnrpc.FeeLimit');

  return messageProblems({message, type});
};

// Check if a method of a sub-server streams its responses
const isStreaming = args => rpcDetails(args).rpc.is_streaming;

const tests = [
  {
    args: {method: 'listPeers', response: {peers: []}, type: 'default'},
    description: 'A valid response has no problems',
    expected: {problems: []},
    method: rpcResponseProblems,
  },
  {
    args: {method: 'listPeers', response: undefined, type: 'default'},
    description: 'A response is expected',
    expected: {
      problems: [
        'default.listPeers: expected ListPeersResponse message object',
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {method: 'listPeers', response: {peerz: []}, type: 'default'},
    description: 'An unknown field is a problem',
    expected: {
      problems: [
        'default.listPeers.peerz: unknown field of lnrpc.ListPeersResponse',
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {method: 'listPeers', response: {peers: {}}, type: 'default'},
    description: 'A repeated field is an array',
    expected: {problems: ['default.listPeers.peers: expected array']},
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'listPeers',
      response: {peers: [{bytes_recv: 1, flap_count: '1', pub_key: key}]},
      type: 'default',
    },
    description: '64 bit numbers are strings and 32 bit numbers are numbers',
    expected: {
      problems: [
        `${firstPeer}.bytes_recv: expected uint64 as string`,
        `${firstPeer}.flap_count: expected int32 as number`,
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'listPeers',
      response: {peers: [{inbound: 'true', pub_key: Buffer.alloc(33)}]},
      type: 'default',
    },
    description: 'Bools are bools and strings are strings',
    expected: {
      problems: [
        `${firstPeer}.inbound: expected bool`,
        `${firstPeer}.pub_key: expected string`,
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'listPeers',
      response: {peers: [{sync_type: 'SYNC'}, {sync_type: 1}]},
      type: 'default',
    },
    description: 'Enums are names of values of the enum',
    expected: {
      problems: [
        `${firstPeer}.sync_type: SYNC is not a SyncType`,
        'default.listPeers.peers[1].sync_type: expected SyncType name string',
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'listPeers',
      response: {
        peers: [{
          features: {
            '1': {is_known: true, is_required: false, name: ''},
            'x': {is_known: true, is_required: false, name: ''},
          },
        }],
      },
      type: 'default',
    },
    description: 'Map keys of numbers are numbers',
    expected: {
      problems: [
        `${firstPeer}.features["x"]: expected uint32 key`,
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'listPeers',
      response: {
        peers: [{
          features: {'-1': {is_known: true, is_required: false, name: ''}},
        }],
      },
      type: 'default',
    },
    description: 'Map keys of unsigned numbers are not negative',
    expected: {
      problems: [
        `${firstPeer}.features["-1"]: expected uint32 key`,
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'listPeers',
      response: {
        peers: [{
          bytes_recv: '-1',
          bytes_sent: '18446744073709551616',
          flap_count: 1.5,
          last_flap_ns: '9223372036854775808',
          ping_time: '-9223372036854775808',
        }],
      },
      type: 'default',
    },
    description: 'Integers are whole numbers in the range of their type',
    expected: {
      problems: [
        `${firstPeer}.bytes_recv: out of uint64 range`,
        `${firstPeer}.bytes_sent: out of uint64 range`,
        `${firstPeer}.flap_count: expected int32 as whole number`,
        `${firstPeer}.last_flap_ns: out of int64 range`,
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'getInfo',
      response: {block_height: -1, num_peers: 2 ** 32},
      type: 'default',
    },
    description: 'Unsigned 32 bit numbers are in range',
    expected: {
      problems: [
        'default.getInfo.block_height: out of uint32 range',
        'default.getInfo.num_peers: out of uint32 range',
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'queryRoutes',
      response: {success_prob: 0.5},
      type: 'default',
    },
    description: 'Floating point numbers can be fractions',
    expected: {problems: []},
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'listPeers',
      response: {peers: [{features: {'1': {is_known: 'yes'}}}]},
      type: 'default',
    },
    description: 'Map values are checked',
    expected: {
      problems: [
        `${firstPeer}.features["1"].is_known: expected bool`,
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'subscribeOnionMessages',
      response: {custom_records: {[typeKey]: Buffer.alloc(1), '64': '00'}},
      type: 'default',
    },
    description: 'Map keys of 64 bit numbers are 8 byte strings',
    expected: {
      problems: [
        `${records}["64"]: expected 8 byte key`,
        `${records}["64"]: expected bytes as Buffer`,
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'lookupInvoice',
      response: {amp_invoice_state: {anything: {state: 'SETTLED'}}},
      type: 'default',
    },
    description: 'Map keys of strings are any strings',
    expected: {problems: []},
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'getNodeInfo',
      response: {channels: [], node: null},
      type: 'default',
    },
    description: 'An unset message is null',
    expected: {problems: []},
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'getNodeInfo',
      response: {node: {addresses: [{addr: 1}]}},
      type: 'default',
    },
    description: 'Nested messages are checked',
    expected: {
      problems: [
        'default.getNodeInfo.node.addresses[0].addr: expected string',
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'getNodeInfo',
      response: {node: 'node'},
      type: 'default',
    },
    description: 'A message field is an object',
    expected: {
      problems: [
        'default.getNodeInfo.node: expected LightningNode message object',
      ],
    },
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'estimateFee',
      response: {sat_per_kw: '1', min_relay_fee_sat_per_kw: '1'},
      type: 'wallet',
    },
    description: 'Fields of other sub-servers are checked',
    expected: {problems: []},
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'sendToRoute',
      response: {},
      type: 'router',
    },
    description: 'A method is expected to be an LND RPC',
    expected: {problems: ['router.sendToRoute: not an LND RPC']},
    method: rpcResponseProblems,
  },
  {
    args: {
      method: 'getInfo',
      response: {},
      type: 'unknown',
    },
    description: 'A sub-server is expected to be an LND sub-server',
    expected: {problems: ['unknown.getInfo: not an LND RPC']},
    method: rpcResponseProblems,
  },
  {
    args: {message: {fixed_msat: '1', limit: 'fixed_msat'}},
    description: 'A oneof is named by the field that is set',
    expected: {problems: []},
    method: feeLimitProblems,
  },
  {
    args: {message: {limit: 'unknown'}},
    description: 'A oneof is named by one of its fields',
    expected: {problems: ['FeeLimit.limit: expected oneof name']},
    method: feeLimitProblems,
  },
  {
    args: {method: 'registerBlockEpochNtfn', type: 'chain'},
    description: 'Blocks are streamed',
    expected: true,
    method: isStreaming,
  },
  {
    args: {method: 'subscribeOnionMessages', type: 'default'},
    description: 'Onion messages are streamed',
    expected: true,
    method: isStreaming,
  },
  {
    args: {method: 'sendPaymentV2', type: 'router'},
    description: 'Payments are streamed',
    expected: true,
    method: isStreaming,
  },
  {
    args: {method: 'getInfo', type: 'default'},
    description: 'Unary methods do not stream',
    expected: false,
    method: isStreaming,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, () => {
    deepStrictEqual(method(args), expected, 'Got expected result');
  });
});
