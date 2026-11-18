const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {chanNumber} = require('bolt07');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {pointFromScalar} = require('tiny-secp256k1');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {makeForwardsResponse} = require('./../../');
const {makeInvoice} = require('./../../');
const {makeLnd} = require('./../../');
const {makeOnionMessage} = require('./../../');
const {makePaymentData} = require('./../../');
const {makePayViaRoutesResponse} = require('./../../');
const {makeWalletVersionResponse} = require('./../../');
const {mineBlocks} = require('./../../');
const {rpcDetails} = require('./../../protos');
const {rpcResponseProblems} = require('./../../protos');

const all = promises => Promise.all(promises);
const asKey = n => Buffer.from(pointFromScalar(Buffer.alloc(32, n), true));
const {entries} = Object;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const identity = '031b84c5567b126440995d3ed5aaba0565d71e1834604819ff9c17f5e9d5dd078f';
const identityLocator = {key_family: 6, key_index: 0};
const {keys} = Object;
const other = '02531fe6068134503d2723133227c867ac8fa6c83c537e9a44c3c5bdbdcb1fe337';
const p2wpkh = '0014751e76e8199196d454941c45d1b3a323f1433bd6';
const peer = '024d4b6cd1361032ca9bd2aeb9d900aa4d45d9ead80ac9423374c451a7254d0766';
const version = 'MUSIG2_VERSION_V100RC2';
const waitMs = 1000;

// A fake LND with every option, so that every kind of response is made. The
// peer signals route blinding and has another channel, so blinded invoices
// can have paths that start at the peer.
const makeFullLnd = () => makeLnd({
  channels: [{id: '1x1x1', other_ids: ['2x2x2'], partner_public_key: peer}],
  features: [38],
  graph: {
    channels: [
      {
        id: '1x1x1',
        policies: [{public_key: identity}, {public_key: peer}],
      },
      {
        id: '3x3x3',
        policies: [{public_key: peer}, {public_key: other}],
      },
    ],
    nodes: [{
      alias: 'peer',
      features: [25, 38],
      public_key: peer,
      sockets: ['127.0.0.1:9735'],
    }],
  },
  network: 'regtest',
  peers: [{features: [38], public_key: peer}],
  routes: [{hops: [{public_key: peer}]}],
});

// A transaction that pays to a P2WPKH output script
const funding = transactionFromComponents({
  inputs: [{id: '11'.repeat(32), script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: p2wpkh, tokens: 1000}],
  version: 2,
}).transaction;

// The id of the transaction that pays to the P2WPKH output script
const fundingId = idForTransaction({transaction: funding}).id;

// A transaction that spends the P2WPKH output
const spend = transactionFromComponents({
  inputs: [{id: fundingId, script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: p2wpkh, tokens: 900}],
  version: 2,
}).transaction;

// A request to start a MuSig2 session with the identity key and the peer
const sessionRequest = {
  all_signer_pubkeys: [hexAsBuffer(identity), hexAsBuffer(peer)],
  key_loc: identityLocator,
  taproot_tweak: {key_spend_only: true},
  version,
};

// Call a method of a fake LND that responds right away, and get the response
const callSync = (lnd, method, request) => {
  let response;

  lnd.signer[method](request, (err, res) => response = res);

  return response;
};

// Get the hash of the chain tip of a fake LND
const tipHash = lnd => {
  let hash;

  lnd.blocks.getBestBlock({}, (err, res) => hash = res.block_hash);

  return hash;
};

// Start a MuSig2 session with the peer, and get the signature of the peer
const signedSession = lnd => {
  const cosigner = makeLnd({secret: Buffer.alloc(32, 2).toString('hex')});

  const session = callSync(lnd, 'muSig2CreateSession', sessionRequest);

  const signing = callSync(cosigner, 'muSig2CreateSession', {
    ...sessionRequest,
    key_loc: identityLocator,
    other_signer_public_nonces: [session.local_public_nonces],
  });

  callSync(lnd, 'muSig2RegisterNonces', {
    other_signer_public_nonces: [signing.local_public_nonces],
    session_id: session.session_id,
  });

  const request = {
    message_digest: Buffer.alloc(32),
    session_id: session.session_id,
  };

  callSync(lnd, 'muSig2Sign', request);

  const signed = callSync(cosigner, 'muSig2Sign', {
    ...request,
    session_id: signing.session_id,
  });

  return {session, signature: signed.local_partial_signature};
};

// The ways to call each method of the fake LND to get its responses, and the
// errors of methods that a default fake LND fails like LND fails
const cases = {
  blocks: {
    getBestBlock: {args: {}},
    getBlock: {
      prepare: lnd => ({block_hash: tipHash(lnd)}),
    },
    getBlockHash: {args: {block_height: 1}},
    getBlockHeader: {
      prepare: lnd => ({block_hash: tipHash(lnd)}),
    },
  },
  chain: {
    registerBlockEpochNtfn: {args: {}},
    registerConfirmationsNtfn: {
      args: {height_hint: 1, num_confs: 1, script: hexAsBuffer(p2wpkh)},
      start: lnd => mineBlocks({lnd, transactions: [funding]}),
    },
    registerSpendNtfn: {
      args: {
        height_hint: 1,
        outpoint: {hash: hexAsBuffer(fundingId).reverse(), index: 0},
        script: hexAsBuffer(p2wpkh),
      },
      start: lnd => mineBlocks({lnd, transactions: [funding, spend]}),
    },
  },
  default: {
    addInvoice: {args: {is_blinded: true, memo: 'memo', value_msat: '1'}},
    forwardingHistory: {args: {index_offset: 0}},
    getChanInfo: {
      args: {chan_id: chanNumber({channel: '1x1x1'}).number},
      defaultError: 'edge not found',
    },
    getInfo: {args: {}},
    getNodeInfo: {
      args: {include_channels: true, pub_key: peer},
      defaultError: 'unable to find node',
    },
    getTransactions: {args: {}},
    listChannels: {args: {}},
    listPeers: {args: {}},
    listUnspent: {args: {}},
    lookupInvoice: {args: {r_hash: Buffer.alloc(32)}},
    pendingChannels: {args: {}},
    queryRoutes: {args: {amt_msat: '1000', pub_key: peer}},
    sendOnionMessage: {
      args: {
        onion: Buffer.alloc(1366),
        path_key: hexAsBuffer(other),
        peer: hexAsBuffer(peer),
      },
      defaultError: 'peer is not connected',
    },
    subscribeInvoices: {
      args: {},
      start: lnd => lnd.default.addInvoice({value: '1'}, () => {}),
    },
    subscribeOnionMessages: {
      args: {},
      start: (lnd, stream) => stream.emit('data', makeOnionMessage({
        encrypted: '00',
        key: other,
        message: {type: '64', value: '00'},
        reply: {
          inbound: [{
            encrypted_data: '00',
            relay_key: asKey(4).toString('hex'),
          }],
          introduction_node: peer,
          key: asKey(5).toString('hex'),
        },
        via: peer,
      })),
    },
  },
  invoices: {
    subscribeSingleInvoice: {args: {r_hash: Buffer.alloc(32)}},
  },
  router: {
    sendPaymentV2: {args: {}},
    sendToRouteV2: {args: {}},
  },
  signer: {
    deriveSharedKey: {args: {ephemeral_pubkey: hexAsBuffer(peer)}},
    muSig2Cleanup: {
      prepare: lnd => {
        const session = callSync(lnd, 'muSig2CreateSession', sessionRequest);

        return {session_id: session.session_id};
      },
    },
    muSig2CombineKeys: {args: sessionRequest},
    muSig2CombineSig: {
      prepare: lnd => {
        const {session, signature} = signedSession(lnd);

        return {
          other_partial_signatures: [signature],
          session_id: session.session_id,
        };
      },
    },
    muSig2CreateSession: {args: sessionRequest},
    muSig2RegisterNonces: {
      prepare: lnd => {
        const session = callSync(lnd, 'muSig2CreateSession', sessionRequest);

        return {
          other_signer_public_nonces: [Buffer.concat([asKey(4), asKey(5)])],
          session_id: session.session_id,
        };
      },
    },
    muSig2Sign: {
      prepare: lnd => {
        const session = callSync(lnd, 'muSig2CreateSession', {
          ...sessionRequest,
          other_signer_public_nonces: [Buffer.concat([asKey(4), asKey(5)])],
        });

        return {
          message_digest: Buffer.alloc(32),
          session_id: session.session_id,
        };
      },
    },
    signMessage: {args: {key_loc: identityLocator, msg: Buffer.alloc(1)}},
    signOutputRaw: {
      args: {
        raw_tx_bytes: hexAsBuffer(spend),
        sign_descs: [{
          key_desc: {key_loc: identityLocator},
          output: {pk_script: hexAsBuffer(p2wpkh), value: 1000},
          sighash: 1,
          witness_script: hexAsBuffer(p2wpkh),
        }],
      },
    },
  },
  version: {
    getVersion: {args: {}},
  },
  wallet: {
    deriveKey: {args: identityLocator},
    deriveNextKey: {args: {key_family: 805}},
    estimateFee: {args: {conf_target: 6}},
    finalizePsbt: {args: {}},
    fundPsbt: {args: {}},
    listUnspent: {args: {}},
    publishTransaction: {args: {tx_hex: hexAsBuffer(funding)}},
    releaseOutput: {args: {}},
  },
};

// Get the first response of a method of the fake LND
const responseOf = ({lnd, method, type}) => {
  const {prepare, start} = cases[type][method];

  // Methods of sessions are called with a session that is made first
  const args = !!prepare ? prepare(lnd) : cases[type][method].args;

  return new Promise((resolve, reject) => {
    // Exit early when the method responds with a stream
    if (rpcDetails({method, type}).rpc.is_streaming) {
      const stream = lnd[type][method](args);

      const timeout = setTimeout(() => reject(new Error('NoData')), waitMs);

      stream.once('data', data => {
        clearTimeout(timeout);

        return resolve(data);
      });

      return !!start ? start(lnd, stream) : undefined;
    }

    return lnd[type][method](args, (err, res) => {
      return !!err ? reject(err) : resolve(res);
    });
  });
};

// The paths of the methods of a fake LND, as sub-server and method names
const methodsOf = ({make}) => entries(make({}))
  .filter(([type]) => type !== 'calls')
  .map(([type, methods]) => keys(methods).map(n => `${type}.${n}`))
  .flat()
  .sort();

// The paths of the methods that have conformance cases
const casePaths = () => entries(cases)
  .map(([type, methods]) => keys(methods).map(n => `${type}.${n}`))
  .flat()
  .sort();

// Call a method of a fake LND, and get the problems of the call: a method
// that is not an LND RPC, a response that does not match the LND protos, or
// an error that is not like the error of LND
const methodProblems = async args => {
  const [type, method] = args.path.split('.');

  const {defaultError} = cases[type][method];
  const lnd = args.make({});
  const {rpc} = rpcDetails({method, type});

  const isFailing = !!args.is_default && !!defaultError;

  // Exit early when the method is not an LND RPC
  if (!rpc) {
    return [`${args.path}: not an LND RPC`];
  }

  // Exit early when a default fake LND, without peers or a graph, fails
  if (isFailing) {
    const details = await responseOf({lnd, method, type})
      .then(() => null, err => err.details);

    return details === defaultError ? [] : [`${args.path}: ${details}`];
  }

  const response = await responseOf({lnd, method, type});

  return rpcResponseProblems({method, response, type}).problems;
};

// Call every method of a fake LND, and get the problems with the calls
const conformanceProblems = async args => {
  const problems = await all(methodsOf(args).map(path => {
    return methodProblems({...args, path});
  }));

  return problems.flat();
};

// Get the problems of responses that are made to be responses of a method
const madeResponseProblems = ({method, responses, type}) => {
  return responses.flatMap(response => {
    return rpcResponseProblems({method, response, type}).problems;
  });
};

const tests = [
  {
    args: {make: makeLnd},
    description: 'Every method of a default fake LND has a conformance case',
    expected: casePaths(),
    method: methodsOf,
  },
  {
    args: {make: makeFullLnd},
    description: 'Every method of a fake LND with options has a case',
    expected: casePaths(),
    method: methodsOf,
  },
  {
    args: {is_default: true, make: makeLnd},
    description: 'A default fake LND has LND RPCs that respond like LND',
    expected: [],
    method: conformanceProblems,
  },
  {
    args: {make: makeFullLnd},
    description: 'A fake LND with every option has RPCs that respond like LND',
    expected: [],
    method: conformanceProblems,
  },
  {
    args: {
      method: 'forwardingHistory',
      responses: [
        makeForwardsResponse({offset: 0}),
        makeForwardsResponse({offset: 1}),
      ],
      type: 'default',
    },
    description: 'A forwards response matches the protos',
    expected: [],
    method: madeResponseProblems,
  },
  {
    args: {
      method: 'lookupInvoice',
      responses: [
        makeInvoice({}),
        makeInvoice({
          description_hash: Buffer.alloc(32).toString('hex'),
          is_confirmed: true,
          is_push: true,
          payments: [{messages: [{type: '34349334', value: '00'}]}],
        }),
      ],
      type: 'default',
    },
    description: 'An invoice matches the protos',
    expected: [],
    method: madeResponseProblems,
  },
  {
    args: {
      method: 'subscribeOnionMessages',
      responses: [makeOnionMessage({encrypted: '', key: identity, via: peer})],
      type: 'default',
    },
    description: 'An onion message matches the protos',
    expected: [],
    method: madeResponseProblems,
  },
  {
    args: {
      method: 'sendPaymentV2',
      responses: [makePaymentData({})],
      type: 'router',
    },
    description: 'Payment data matches the protos',
    expected: [],
    method: madeResponseProblems,
  },
  {
    args: {
      method: 'sendToRouteV2',
      responses: [
        makePayViaRoutesResponse({}),
        makePayViaRoutesResponse({is_unknown_failure: true}),
      ],
      type: 'router',
    },
    description: 'A pay via routes response matches the protos',
    expected: [],
    method: madeResponseProblems,
  },
  {
    args: {
      method: 'getVersion',
      responses: [makeWalletVersionResponse({})],
      type: 'version',
    },
    description: 'A wallet version response matches the protos',
    expected: [],
    method: madeResponseProblems,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, async () => {
    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
