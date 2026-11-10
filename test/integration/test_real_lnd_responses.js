const {createHash} = require('node:crypto');
const {createPublicKey} = require('node:crypto');
const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');
const {verify} = require('node:crypto');

const {chanNumber} = require('bolt07');
const {createInvoice} = require('lightning');
const {parsePaymentRequest} = require('invoices');
const {pay} = require('lightning');
const {pointCompress} = require('tiny-secp256k1');
const {recover} = require('tiny-secp256k1');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {verifySchnorr} = require('tiny-secp256k1');

const {makeLnd} = require('./../../');
const {rpcResponseProblems} = require('./../../protos');

const capacity = 1e6;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const graphAttempts = 60;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const identity = {key_family: 6, key_index: 0};
const {isArray} = Array;
const {keys} = Object;
const payAttempts = 10;
const push = 5e5;
const retryMs = 1000;
const sha256 = n => createHash('sha256').update(n).digest();
const size = 3;
const unsupported = /unknown method|unknown service/;
const waitMs = 1000 * 30;

// The kind of a value, as kinds are compared between responses
const kindOf = value => {
  if (value === null) {
    return 'null';
  }

  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return 'bytes';
  }

  return isArray(value) ? 'array' : typeof value;
};

// The differences in kinds of the values of a mock and a real response
const differences = ({at, mock, real}) => {
  const kind = kindOf(mock);

  // An unset message is null in a real response
  if ([kind, kindOf(real)].includes('null') || kind === 'undefined') {
    return [];
  }

  if (kind !== kindOf(real)) {
    return [`${at}: the mock has ${kind}, LND has ${kindOf(real)}`];
  }

  if (kind === 'array') {
    const [mockElement] = mock;
    const [realElement] = real;

    if (mockElement === undefined || realElement === undefined) {
      return [];
    }

    return differences({at: `${at}[0]`, mock: mockElement, real: realElement});
  }

  if (kind !== 'object') {
    return [];
  }

  // Fields of maps can be different between responses
  return keys(mock).filter(key => key in real).flatMap(key => {
    return differences({at: `${at}.${key}`, mock: mock[key], real: real[key]});
  });
};

// Call an RPC method and get the error or response
const call = ({args, lnd, method, type}) => new Promise(resolve => {
  return lnd[type][method](args, (err, res) => resolve({err, res}));
});

// Get the first data on a stream, after starting it
const firstData = ({args, lnd, method, start, type}) => {
  return new Promise(resolve => {
    const stream = lnd[type][method](args);

    const timeout = setTimeout(() => resolve({err: 'NoData'}), waitMs);

    stream.once('data', data => {
      clearTimeout(timeout);

      stream.cancel();

      return resolve({data});
    });

    stream.once('error', err => {
      clearTimeout(timeout);

      return resolve({err});
    });

    return !!start ? start() : undefined;
  });
};

// Pay a payment request, retrying while the channel becomes active
const payRequest = async ({lnd, request}) => {
  for (let attempt = 1;; attempt++) {
    try {
      return await pay({lnd, request});
    } catch (err) {
      if (attempt === payAttempts) {
        throw err;
      }

      await delay(retryMs);
    }
  }
};

// Add a blinded invoice, retrying while the graph learns the peer's channels
const addBlindedInvoice = async ({generate, lnd}) => {
  for (let attempt = 1;; attempt++) {
    const added = await call({
      lnd,
      args: {is_blinded: true, value: '1'},
      method: 'addInvoice',
      type: 'default',
    });

    if (!added.err || attempt === graphAttempts) {
      return added;
    }

    // Blocks help the channel and node announcements spread
    await generate({});

    await delay(retryMs);
  }
};

// Verify a DER ECDSA signature of the SHA256 hash of a message
const verifyEcdsa = args => {
  const publicKey = hexAsBuffer(args.public_key);

  const point = Buffer.from(pointCompress(publicKey, false));

  const key = createPublicKey({
    format: 'jwk',
    key: {
      crv: 'secp256k1',
      kty: 'EC',
      x: point.subarray(1, 33).toString('base64url'),
      y: point.subarray(33).toString('base64url'),
    },
  });

  return verify('sha256', args.message, key, args.signature);
};

// The responses and errors of a real LND match the responses of the fake LND
test('The fake LND responds like a real LND', async t => {
  const {channels, kill, nodes} = await spawnLightningCluster({
    capacity,
    size,
  });

  // LND only starts blinded paths at a peer that has another channel, so the
  // first node gives the client a second channel: first -> client -> server
  const [first, client, server] = nodes;
  const [firstChannel, channel] = channels;

  // The fake LND is the server, and its graph has the client's channels
  const fake = makeLnd({
    channels: [{id: channel.id, partner_public_key: client.id}],
    graph: {
      channels: [
        {
          id: channel.id,
          policies: [{public_key: client.id}, {public_key: server.id}],
        },
        {
          id: firstChannel.id,
          policies: [{public_key: first.id}, {public_key: client.id}],
        },
      ],
      nodes: [{features: [25], public_key: client.id}],
    },
    network: 'regtest',
    peers: [{public_key: client.id}],
    routes: [{hops: [{channel: channel.id, public_key: client.id}]}],
  });

  const fakeIdentity = (await call({
    args: identity,
    lnd: fake,
    method: 'deriveKey',
    type: 'wallet',
  }))
  .res
  .raw_key_bytes;

  // Requests that are made of a real LND and the fake LND
  const requests = [
    {args: {}, method: 'getInfo', type: 'default'},
    {args: {}, method: 'listChannels', type: 'default'},
    {args: {}, method: 'listPeers', type: 'default'},
    {args: {}, method: 'pendingChannels', type: 'default'},
    {args: {}, method: 'getTransactions', type: 'default'},
    {args: {max_confs: 1e6}, method: 'listUnspent', type: 'default'},
    {
      args: {chan_id: chanNumber({channel: channel.id}).number},
      method: 'getChanInfo',
      type: 'default',
    },
    {
      args: {include_channels: true, pub_key: client.id},
      method: 'getNodeInfo',
      type: 'default',
    },
    {
      args: {amt_msat: '1000', pub_key: client.id},
      method: 'queryRoutes',
      type: 'default',
    },
    {
      args: {memo: 'memo', value_msat: '1000'},
      method: 'addInvoice',
      type: 'default',
    },
    {
      args: {index_offset: 0, num_max_events: 1, start_time: '0'},
      method: 'forwardingHistory',
      type: 'default',
    },
    {
      args: {ephemeral_pubkey: hexAsBuffer(client.id), key_loc: identity},
      method: 'deriveSharedKey',
      type: 'signer',
    },
    {
      args: {key_loc: identity, msg: Buffer.from('msg'), schnorr_sig: true},
      method: 'signMessage',
      type: 'signer',
    },
    {args: identity, method: 'deriveKey', type: 'wallet'},
    {args: {key_family: 805}, method: 'deriveNextKey', type: 'wallet'},
    {args: {conf_target: 6}, method: 'estimateFee', type: 'wallet'},
    {args: {max_confs: 1e6}, method: 'listUnspent', type: 'wallet'},
    {args: {}, method: 'getVersion', type: 'version'},
  ];

  try {
    // The client opened the channel, so the server has no funds to send with
    const pushed = await createInvoice({lnd: server.lnd, tokens: push});

    await payRequest({lnd: client.lnd, request: pushed.request});

    for (const {args, method, type} of requests) {
      await t.test(`${type}.${method} matches`, async () => {
        const real = await call({args, method, type, lnd: server.lnd});

        deepStrictEqual(real.err, null, 'LND responds');

        // The checks of the protos agree with the responses of LND
        const realProblems = rpcResponseProblems({
          method,
          type,
          response: real.res,
        });

        deepStrictEqual(realProblems.problems, [], 'LND matches the protos');

        const mock = await call({args, method, type, lnd: fake});

        const at = `${type}.${method}`;

        deepStrictEqual(
          differences({at, mock: mock.res, real: real.res}),
          [],
          'The fake LND gives the same kinds of values as LND'
        );
      });
    }

    await t.test('Stream data matches', async () => {
      const blocks = await firstData({
        args: {},
        lnd: server.lnd,
        method: 'registerBlockEpochNtfn',
        type: 'chain',
      });

      deepStrictEqual(
        rpcResponseProblems({
          method: 'registerBlockEpochNtfn',
          response: blocks.data,
          type: 'chain',
        })
        .problems,
        [],
        'Blocks match the protos'
      );

      const invoices = await firstData({
        args: {},
        lnd: server.lnd,
        method: 'subscribeInvoices',
        start: () => server.lnd.default.addInvoice({value: '1'}, () => {}),
        type: 'default',
      });

      const fakeInvoices = await firstData({
        args: {},
        lnd: fake,
        method: 'subscribeInvoices',
        start: () => fake.default.addInvoice({value: '1'}, () => {}),
        type: 'default',
      });

      const invoiceDifferences = differences({
        at: 'invoice',
        mock: fakeInvoices.data,
        real: invoices.data,
      });

      deepStrictEqual(invoiceDifferences, [], 'Invoices have the same kinds');
    });

    await t.test('Shared keys are derived like LND derives them', async () => {
      // LND derives with the fake key what the fake derives with the LND key
      const real = await call({
        args: {ephemeral_pubkey: fakeIdentity, key_loc: identity},
        lnd: server.lnd,
        method: 'deriveSharedKey',
        type: 'signer',
      });

      const mock = await call({
        args: {ephemeral_pubkey: hexAsBuffer(server.id), key_loc: identity},
        lnd: fake,
        method: 'deriveSharedKey',
        type: 'signer',
      });

      deepStrictEqual(mock.res.shared_key, real.res.shared_key, 'Same ECDH');
    });

    await t.test('Signatures are signed like LND signs them', async () => {
      const msg = Buffer.from('message');
      const tag = Buffer.from('tag');

      const tagged = await call({
        args: {msg, tag, key_loc: identity, schnorr_sig: true},
        lnd: server.lnd,
        method: 'signMessage',
        type: 'signer',
      });

      const tagHash = sha256(tag);

      deepStrictEqual(
        verifySchnorr(
          sha256(Buffer.concat([tagHash, tagHash, msg])),
          hexAsBuffer(server.id).subarray(1),
          tagged.res.signature
        ),
        true,
        'Tagged Schnorr signatures sign the BIP-340 tagged hash'
      );

      const ecdsa = await call({
        args: {msg, key_loc: identity},
        lnd: server.lnd,
        method: 'signMessage',
        type: 'signer',
      });

      deepStrictEqual(
        verifyEcdsa({
          message: msg,
          public_key: server.id,
          signature: ecdsa.res.signature,
        }),
        true,
        'ECDSA signatures are DER signatures of the SHA256 hash'
      );

      const compact = await call({
        args: {msg, compact_sig: true, key_loc: identity},
        lnd: server.lnd,
        method: 'signMessage',
        type: 'signer',
      });

      const [header] = compact.res.signature;

      const recovered = recover(
        sha256(msg),
        compact.res.signature.subarray(1),
        header - 31,
        true
      );

      deepStrictEqual(
        Buffer.from(recovered).toString('hex'),
        server.id,
        'Compact signatures are recoverable with a compressed key header'
      );
    });

    await t.test('Next keys count up in a family', async () => {
      const family = 1000;

      const indexes = async lnd => {
        const first = await call({
          lnd,
          args: {key_family: family},
          method: 'deriveNextKey',
          type: 'wallet',
        });

        const second = await call({
          lnd,
          args: {key_family: family},
          method: 'deriveNextKey',
          type: 'wallet',
        });

        return [first, second].map(n => n.res.key_loc.key_index);
      };

      deepStrictEqual(await indexes(fake), await indexes(server.lnd));
    });

    await t.test('Edges are ordered by node public key', async () => {
      const {res} = await call({
        args: {chan_id: chanNumber({channel: channel.id}).number},
        lnd: server.lnd,
        method: 'getChanInfo',
        type: 'default',
      });

      const sorted = [res.node1_pub, res.node2_pub].sort();

      deepStrictEqual([res.node1_pub, res.node2_pub], sorted, 'Lesser first');
    });

    await t.test('Invoices have the same features', async () => {
      const real = await call({
        args: {value: '1'},
        lnd: server.lnd,
        method: 'addInvoice',
        type: 'default',
      });

      const mock = await call({
        args: {value: '1'},
        lnd: fake,
        method: 'addInvoice',
        type: 'default',
      });

      const bits = ({res}) => {
        const request = parsePaymentRequest({request: res.payment_request});

        return request.features.map(n => n.bit);
      };

      deepStrictEqual(bits(mock), bits(real), 'Same invoice features');

      const blinded = await addBlindedInvoice({
        generate: client.generate,
        lnd: server.lnd,
      });

      deepStrictEqual(blinded.err, null, 'LND makes blinded invoices');

      const introductions = ({res}) => {
        const {paths} = parsePaymentRequest({request: res.payment_request});

        return paths.map(n => n.introduction_node);
      };

      deepStrictEqual(
        introductions(blinded),
        [client.id],
        'Blinded paths start at the channel peer'
      );

      const fakeBlinded = await call({
        args: {is_blinded: true, value: '1'},
        lnd: fake,
        method: 'addInvoice',
        type: 'default',
      });

      deepStrictEqual(
        introductions(fakeBlinded),
        introductions(blinded),
        'The fake LND starts blinded paths at the same peer'
      );
    });

    // Routes of the fake LND do not depend on balances, so a route that is too
    // large for a channel is not compared
    await t.test('Errors have the same details', async () => {
      const errors = [
        {
          args: {chan_id: chanNumber({channel: '9x9x9'}).number},
          method: 'getChanInfo',
          type: 'default',
        },
        {
          args: {pub_key: Buffer.alloc(33, 2).toString('hex')},
          method: 'getNodeInfo',
          type: 'default',
        },
        {
          args: {
            ephemeral_pubkey: hexAsBuffer(client.id),
            key_desc: {key_loc: identity},
            key_loc: identity,
          },
          method: 'deriveSharedKey',
          type: 'signer',
        },
        {
          args: {msg: Buffer.from('msg')},
          method: 'signMessage',
          type: 'signer',
        },
        {
          args: {
            onion: Buffer.alloc(1366),
            path_key: hexAsBuffer(client.id),
            peer: Buffer.alloc(33, 2),
          },
          method: 'sendOnionMessage',
          type: 'default',
        },
      ];

      for (const {args, method, type} of errors) {
        const real = await call({args, method, type, lnd: server.lnd});

        // Exit early when LND does not support the method
        if (!!real.err && unsupported.test(real.err.details)) {
          continue;
        }

        const mock = await call({args, method, type, lnd: fake});

        deepStrictEqual(
          !!mock.err && mock.err.details,
          !!real.err && real.err.details,
          `${type}.${method} fails like LND`
        );
      }
    });

    await t.test('Onion messages are received like LND has them', async () => {
      const {err} = await call({
        args: {},
        lnd: client.lnd,
        method: 'getInfo',
        type: 'default',
      });

      deepStrictEqual(err, null, 'Client is up');

      const {blindedPathFromHops} = require('bolt04');
      const {sendMessage} = require('lightning');

      const {key, path} = blindedPathFromHops({hops: [server.id]});
      const sent = [];

      const real = await firstData({
        args: {},
        lnd: server.lnd,
        method: 'subscribeOnionMessages',
        start: () => sendMessage({
          key,
          inbound: path,
          lnd: client.lnd,
          message: {type: '64', value: '00'},
          outbound: [server.id],
        })
        .catch(err => sent.push(err)),
        type: 'default',
      });

      // Exit early when LND does not support onion messages
      if (!!real.err && unsupported.test(real.err.details)) {
        return;
      }

      // Exit early when LND does not support sending onion messages
      if (sent.some(([code]) => code === 501)) {
        return;
      }

      deepStrictEqual(
        rpcResponseProblems({
          method: 'subscribeOnionMessages',
          response: real.data,
          type: 'default',
        })
        .problems,
        [],
        'Onion messages match the protos'
      );
    });
  } finally {
    await kill({});
  }
});
