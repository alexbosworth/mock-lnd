const {createHash} = require('node:crypto');
const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {chanNumber} = require('bolt07');
const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {createInvoice} = require('lightning');
const {idForTransaction} = require('@alexbosworth/blockchain');
const {parsePaymentRequest} = require('invoices');
const {pay} = require('lightning');
const {recover} = require('tiny-secp256k1');
const {signTransaction} = require('lightning');
const {spawnLightningCluster} = require('ln-docker-daemons');
const {transactionFromComponents} = require('@alexbosworth/blockchain');
const {v0HashToSign} = require('@alexbosworth/blockchain');
const {v1HashToSign} = require('p2tr');
const {v1OutputScript} = require('p2tr');
const {verify} = require('tiny-secp256k1');
const {verifySchnorr} = require('tiny-secp256k1');

const {makeLnd} = require('./../../');
const {mineBlocks} = require('./../../');
const {rpcResponseProblems} = require('./../../protos');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const capacity = 1e6;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const graphAttempts = 60;
const headerByteLength = 80;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const idAsHash = id => Buffer.from(id, 'hex').reverse();
const identity = {key_family: 6, key_index: 0};
const {isArray} = Array;
const {isBuffer} = Buffer;
const {keys} = Object;
const musig2Version = 'MUSIG2_VERSION_V100RC2';
const p2wpkh = '0014751e76e8199196d454941c45d1b3a323f1433bd6';
const p2wpkhScriptCode = '76a914751e76e8199196d454941c45d1b3a323f1433bd688ac';
const payAttempts = 10;
const push = 5e5;
const retryMs = 1000;
const sha256 = n => createHash('sha256').update(n).digest();
const sighashAll = 1;
const sighashDefault = 0;
const signTokens = 1000;
const size = 3;
const unsupported = /unknown method|unknown service/;
const waitMs = 1000 * 30;

// A transaction that pays to a P2WPKH output script
const funding = transactionFromComponents({
  inputs: [{id: '11'.repeat(32), script: '', sequence: 0, vout: 0}],
  locktime: 0,
  outputs: [{script: p2wpkh, tokens: signTokens}],
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

// A compressed public key with an x coordinate that is not on the curve
const offCurveKey = Buffer.concat([Buffer.from([2]), Buffer.alloc(32)]);

// A compressed public key with an x coordinate past the field prime
const outOfFieldKey = Buffer.concat([Buffer.from([2]), Buffer.alloc(32, 255)]);

// A public key of zeros, which is not a public key
const zeroKey = Buffer.alloc(33);

// A spent taproot output
const taprootOutput = {
  pk_script: hexAsBuffer(`5120${'22'.repeat(32)}`),
  value: signTokens,
};

// Make a sign descriptor that signs for the P2WPKH output with the identity
const signDesc = args => ({
  input_index: 0,
  key_desc: {key_loc: identity},
  output: {pk_script: hexAsBuffer(p2wpkh), value: signTokens},
  sighash: sighashAll,
  witness_script: hexAsBuffer(p2wpkh),
  ...args,
});

// The kind of a value, as kinds are compared between responses
const kindOf = value => {
  if (value === null) {
    return 'null';
  }

  if (isBuffer(value) || value instanceof Uint8Array) {
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

// Decode a DER signature into a compact signature
const compactSignature = der => {
  const rLength = der[3];

  const r = der.subarray(4, 4 + rLength);
  const s = der.subarray(6 + rLength);

  // DER integers can have a leading zero, and can be shorter than 32 bytes
  const scalars = [r, s].map(n => {
    const hex = bufferAsHex(n).padStart(64, '0');

    return hexAsBuffer(hex.slice(-64));
  });

  return Buffer.concat(scalars);
};

// Verify a DER ECDSA signature of the SHA256 hash of a message
const verifyEcdsa = args => {
  const signature = compactSignature(args.signature);

  return verify(sha256(args.message), hexAsBuffer(args.public_key), signature);
};

// A transaction that spends an output again, without a signature
const conflictWith = ({id, vout}) => transactionFromComponents({
  inputs: [{id, vout, script: '', sequence: 0}],
  locktime: 0,
  outputs: [{script: p2wpkh, tokens: signTokens}],
  version: 2,
}).transaction;

// Get the tip block of a node, with the raw block and the header
const tipBlock = async ({lnd}) => {
  const best = await call({
    lnd,
    args: {},
    method: 'getBestBlock',
    type: 'blocks',
  });

  const args = {block_hash: best.res.block_hash};

  const block = await call({args, lnd, method: 'getBlock', type: 'blocks'});

  const header = await call({
    args,
    lnd,
    method: 'getBlockHeader',
    type: 'blocks',
  });

  return {block: block.res, hash: best.res.block_hash, header: header.res};
};

// Find a wallet transaction that spends a wallet output, with the spent output
const walletSpend = async ({lnd}) => {
  const {res} = await call({
    lnd,
    args: {},
    method: 'getTransactions',
    type: 'default',
  });

  const transactions = res.transactions.filter(n => !!n.block_height);

  const confirmed = transactions.map(tx => ({
    height: tx.block_height,
    id: tx.tx_hash,
    ...componentsOfTransaction({transaction: tx.raw_tx_hex}),
  }));

  const outputs = confirmed.flatMap(tx => {
    return tx.outputs.map((output, vout) => ({
      vout,
      height: tx.height,
      id: tx.id,
      script: output.script,
    }));
  });

  // The wallet output that a transaction spends
  const spentBy = tx => {
    const spends = tx.inputs.map(input => {
      return outputs.find(n => n.id === input.id && n.vout === input.vout);
    });

    return spends.find(n => !!n);
  };

  const spending = confirmed.find(tx => !!spentBy(tx));

  return {spending, spent: spentBy(spending)};
};

// Sign v0 and taproot spends with the identity key, and check the signatures
const signedOutputs = async ({key, lnd}) => {
  const internalKey = bufferAsHex(key.subarray(1));

  const taproot = v1OutputScript({internal_key: internalKey});

  const v0 = await signTransaction({
    lnd,
    inputs: [{
      key_family: identity.key_family,
      key_index: identity.key_index,
      output_script: p2wpkh,
      output_tokens: signTokens,
      sighash: sighashAll,
      vin: 0,
      witness_script: p2wpkh,
    }],
    transaction: funding,
  });

  const v1 = await signTransaction({
    lnd,
    inputs: [{
      key_family: identity.key_family,
      key_index: identity.key_index,
      output_script: taproot.script,
      output_tokens: signTokens,
      sighash: sighashDefault,
      vin: 0,
    }],
    transaction: funding,
  });

  // P2WPKH is signed with the P2PKH script of the public key hash
  const v0Hash = v0HashToSign({
    script: p2wpkhScriptCode,
    sighash: sighashAll,
    tokens: signTokens,
    transaction: funding,
    vin: 0,
  });

  const v1Hash = v1HashToSign({
    sighash: sighashDefault,
    spends: [{script: taproot.script, tokens: signTokens}],
    transaction: funding,
    vin: 0,
  });

  const [v0Signature] = v0.signatures.map(hexAsBuffer);
  const [v1Signature] = v1.signatures.map(hexAsBuffer);

  // A key spend is signed with the key tweaked with the BIP-86 tweak
  const outputKey = hexAsBuffer(taproot.external_key).subarray(1);

  return {
    taproot: verifySchnorr(hexAsBuffer(v1Hash.hash), outputKey, v1Signature),
    v0: verify(hexAsBuffer(v0Hash.hash), key, compactSignature(v0Signature)),
  };
};

// Sign a digest in a MuSig2 session
const muSig2Sign = ({digest, lnd, session}) => call({
  lnd,
  args: {message_digest: digest, session_id: session.session_id},
  method: 'muSig2Sign',
  type: 'signer',
});

// Combine the partial signature of the other signer in a MuSig2 session
const muSig2Combine = ({lnd, session, signed}) => call({
  lnd,
  args: {
    other_partial_signatures: [signed.res.local_partial_signature],
    session_id: session.session_id,
  },
  method: 'muSig2CombineSig',
  type: 'signer',
});

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
    {args: {}, method: 'getBestBlock', type: 'blocks'},
    {args: {block_height: 1}, method: 'getBlockHash', type: 'blocks'},
    {
      args: {
        all_signer_pubkeys: [hexAsBuffer(client.id), fakeIdentity],
        taproot_tweak: {key_spend_only: true},
        version: musig2Version,
      },
      method: 'muSig2CombineKeys',
      type: 'signer',
    },
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

    await t.test('Blocks are hashed like LND hashes them', async () => {
      const real = await tipBlock({lnd: server.lnd});
      const mock = await tipBlock({lnd: fake});

      deepStrictEqual(
        differences({at: 'block', mock: mock.block, real: real.block}),
        [],
        'The fake LND gives blocks with the same kinds of values'
      );

      deepStrictEqual(
        differences({at: 'header', mock: mock.header, real: real.header}),
        [],
        'The fake LND gives headers with the same kinds of values'
      );

      deepStrictEqual(
        rpcResponseProblems({
          method: 'getBlockHeader',
          response: real.header,
          type: 'blocks',
        })
        .problems,
        [],
        'Headers match the protos'
      );

      [real, mock].forEach(({block, hash, header}) => {
        const raw = header.raw_block_header;

        // Hashes are in the byte order of the hash of the header
        deepStrictEqual(sha256(sha256(raw)), hash, 'Hash of the header');

        deepStrictEqual(
          block.raw_block.subarray(0, headerByteLength),
          raw,
          'A block starts with its header'
        );
      });
    });

    await t.test('Outputs are signed like LND signs them', async () => {
      const real = await signedOutputs({
        key: hexAsBuffer(server.id),
        lnd: server.lnd,
      });

      const mock = await signedOutputs({key: fakeIdentity, lnd: fake});

      deepStrictEqual(real, {taproot: true, v0: true}, 'LND signs the hashes');

      deepStrictEqual(mock, real, 'The fake LND signs the same hashes');
    });

    await t.test('MuSig2 sessions sign like LND signs them', async () => {
      const digest = sha256(Buffer.from('digest'));

      // Sessions are made with a BIP-86 tweak and with a script root tweak
      const tweaks = [
        {key_spend_only: true},
        {script_root: sha256(Buffer.from('root'))},
      ];

      for (const tweak of tweaks) {
        const request = {
          all_signer_pubkeys: [hexAsBuffer(server.id), fakeIdentity],
          key_loc: identity,
          taproot_tweak: tweak,
          version: musig2Version,
        };

        const real = await call({
          args: request,
          lnd: server.lnd,
          method: 'muSig2CreateSession',
          type: 'signer',
        });

        deepStrictEqual(real.err, null, 'LND starts a session');

        const mock = await call({
          args: {
            ...request,
            other_signer_public_nonces: [real.res.local_public_nonces],
          },
          lnd: fake,
          method: 'muSig2CreateSession',
          type: 'signer',
        });

        deepStrictEqual(
          [mock.res.combined_key, mock.res.taproot_internal_key],
          [real.res.combined_key, real.res.taproot_internal_key],
          'The fake LND combines keys like LND combines them'
        );

        const registered = await call({
          args: {
            other_signer_public_nonces: [mock.res.local_public_nonces],
            session_id: real.res.session_id,
          },
          lnd: server.lnd,
          method: 'muSig2RegisterNonces',
          type: 'signer',
        });

        deepStrictEqual(registered.err, null, 'LND takes the fake nonce');

        const realSigned = await muSig2Sign({
          digest,
          lnd: server.lnd,
          session: real.res,
        });

        const mockSigned = await muSig2Sign({
          digest,
          lnd: fake,
          session: mock.res,
        });

        const realFinal = await muSig2Combine({
          lnd: server.lnd,
          session: real.res,
          signed: mockSigned,
        });

        deepStrictEqual(realFinal.err, null, 'LND takes the fake signature');

        const mockFinal = await muSig2Combine({
          lnd: fake,
          session: mock.res,
          signed: realSigned,
        });

        deepStrictEqual(
          mockFinal.res.final_signature,
          realFinal.res.final_signature,
          'The fake LND combines the same signature'
        );

        deepStrictEqual(
          verifySchnorr(
            digest,
            real.res.combined_key,
            realFinal.res.final_signature
          ),
          true,
          'The signature is valid for the combined key'
        );
      }
    });

    await t.test('Chain notifications are like LND has them', async () => {
      const {spending, spent} = await walletSpend({lnd: client.lnd});

      const [output] = spending.outputs;

      const confs = await firstData({
        args: {
          height_hint: spending.height,
          num_confs: 1,
          script: hexAsBuffer(output.script),
          txid: idAsHash(spending.id),
        },
        lnd: client.lnd,
        method: 'registerConfirmationsNtfn',
        type: 'chain',
      });

      const spends = await firstData({
        args: {
          height_hint: spent.height,
          outpoint: {hash: idAsHash(spent.id), index: spent.vout},
          script: hexAsBuffer(spent.script),
        },
        lnd: client.lnd,
        method: 'registerSpendNtfn',
        type: 'chain',
      });

      // The fake LND has a transaction that is spent in its chain
      mineBlocks({lnd: fake, transactions: [funding, spend]});

      const fakeConfs = await firstData({
        args: {
          height_hint: 1,
          num_confs: 1,
          script: hexAsBuffer(p2wpkh),
          txid: idAsHash(fundingId),
        },
        lnd: fake,
        method: 'registerConfirmationsNtfn',
        type: 'chain',
      });

      const fakeSpends = await firstData({
        args: {
          height_hint: 1,
          outpoint: {hash: idAsHash(fundingId), index: 0},
          script: hexAsBuffer(p2wpkh),
        },
        lnd: fake,
        method: 'registerSpendNtfn',
        type: 'chain',
      });

      const notifications = [
        {method: 'registerConfirmationsNtfn', mock: fakeConfs, real: confs},
        {method: 'registerSpendNtfn', mock: fakeSpends, real: spends},
      ];

      notifications.forEach(notification => {
        const {method} = notification;

        deepStrictEqual(notification.real.err, undefined, `${method} data`);

        deepStrictEqual(
          rpcResponseProblems({
            method,
            response: notification.real.data,
            type: 'chain',
          })
          .problems,
          [],
          `${method} data matches the protos`
        );

        deepStrictEqual(
          differences({
            at: method,
            mock: notification.mock.data,
            real: notification.real.data,
          }),
          [],
          `${method} data has the same kinds of values`
        );
      });

      // Transactions that spend spent outputs are rejected
      const published = await call({
        args: {tx_hex: hexAsBuffer(conflictWith(spent))},
        lnd: client.lnd,
        method: 'publishTransaction',
        type: 'wallet',
      });

      const fakePublished = await call({
        args: {tx_hex: hexAsBuffer(conflictWith({id: fundingId, vout: 0}))},
        lnd: fake,
        method: 'publishTransaction',
        type: 'wallet',
      });

      deepStrictEqual(
        !!fakePublished.err && fakePublished.err.details,
        !!published.err && published.err.details,
        'Double spends fail like LND'
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
        {
          args: {block_hash: Buffer.alloc(32)},
          method: 'getBlock',
          type: 'blocks',
        },
        {
          args: {block_hash: Buffer.alloc(31)},
          method: 'getBlock',
          type: 'blocks',
        },
        {
          args: {block_hash: Buffer.alloc(32)},
          method: 'getBlockHeader',
          type: 'blocks',
        },
        {
          args: {block_height: 1e6},
          method: 'getBlockHash',
          type: 'blocks',
        },
        {
          args: {
            all_signer_pubkeys: [hexAsBuffer(client.id).subarray(1)],
            version: musig2Version,
          },
          method: 'muSig2CombineKeys',
          type: 'signer',
        },
        {
          args: {
            all_signer_pubkeys: [hexAsBuffer(client.id)],
            key_loc: identity,
          },
          method: 'muSig2CreateSession',
          type: 'signer',
        },
        {
          args: {
            message_digest: Buffer.alloc(32),
            session_id: Buffer.alloc(32),
          },
          method: 'muSig2Sign',
          type: 'signer',
        },
        {
          args: {session_id: Buffer.alloc(32)},
          method: 'muSig2Cleanup',
          type: 'signer',
        },
        {
          args: {tx_hex: Buffer.alloc(0)},
          method: 'publishTransaction',
          type: 'wallet',
        },
        {
          args: {tx_hex: Buffer.alloc(1)},
          method: 'publishTransaction',
          type: 'wallet',
        },
        {
          args: {sign_descs: [signDesc({})]},
          method: 'signOutputRaw',
          type: 'signer',
        },
        {
          args: {raw_tx_bytes: hexAsBuffer(spend), sign_descs: []},
          method: 'signOutputRaw',
          type: 'signer',
        },
        {
          args: {raw_tx_bytes: Buffer.alloc(1), sign_descs: [signDesc({})]},
          method: 'signOutputRaw',
          type: 'signer',
        },
        {
          args: {
            raw_tx_bytes: hexAsBuffer(spend),
            sign_descs: [signDesc({input_index: 1})],
          },
          method: 'signOutputRaw',
          type: 'signer',
        },
        {
          args: {
            prev_outputs: [taprootOutput],
            raw_tx_bytes: hexAsBuffer(spend),
            sign_descs: [
              signDesc({
                input_index: 1,
                output: taprootOutput,
                sign_method: 1,
                witness_script: undefined,
              }),
            ],
          },
          method: 'signOutputRaw',
          type: 'signer',
        },
        {
          args: {
            raw_tx_bytes: hexAsBuffer(spend),
            sign_descs: [signDesc({witness_script: undefined})],
          },
          method: 'signOutputRaw',
          type: 'signer',
        },
        {
          args: {
            raw_tx_bytes: hexAsBuffer(spend),
            sign_descs: [signDesc({key_desc: {raw_key_bytes: zeroKey}})],
          },
          method: 'signOutputRaw',
          type: 'signer',
        },
        {
          args: {
            raw_tx_bytes: hexAsBuffer(spend),
            sign_descs: [signDesc({key_desc: {raw_key_bytes: offCurveKey}})],
          },
          method: 'signOutputRaw',
          type: 'signer',
        },
        {
          args: {
            raw_tx_bytes: hexAsBuffer(spend),
            sign_descs: [signDesc({key_desc: {raw_key_bytes: outOfFieldKey}})],
          },
          method: 'signOutputRaw',
          type: 'signer',
        },
        {
          args: {
            other_partial_signatures: [Buffer.alloc(32)],
            session_id: Buffer.alloc(32),
          },
          method: 'muSig2CombineSig',
          type: 'signer',
        },
        {
          args: {other_partial_signatures: [], session_id: Buffer.alloc(32)},
          method: 'muSig2CombineSig',
          type: 'signer',
        },
        {
          args: {
            other_signer_public_nonces: [Buffer.alloc(66)],
            session_id: Buffer.alloc(32),
          },
          method: 'muSig2RegisterNonces',
          type: 'signer',
        },
        {
          args: {
            all_signer_pubkeys: [hexAsBuffer(server.id), fakeIdentity],
            version: 'MUSIG2_VERSION_UNDEFINED',
          },
          method: 'muSig2CombineKeys',
          type: 'signer',
        },
        {
          args: {height_hint: 1, num_confs: 1},
          is_stream: true,
          method: 'registerConfirmationsNtfn',
          type: 'chain',
        },
        {
          args: {height_hint: 1, num_confs: 145, script: hexAsBuffer(p2wpkh)},
          is_stream: true,
          method: 'registerConfirmationsNtfn',
          type: 'chain',
        },
        {
          args: {num_confs: 1, script: hexAsBuffer(p2wpkh)},
          is_stream: true,
          method: 'registerConfirmationsNtfn',
          type: 'chain',
        },
        {
          args: {height_hint: 1},
          is_stream: true,
          method: 'registerSpendNtfn',
          type: 'chain',
        },
        {
          args: {script: hexAsBuffer(p2wpkh)},
          is_stream: true,
          method: 'registerSpendNtfn',
          type: 'chain',
        },
        {
          args: {height_hint: 1, script: taprootOutput.pk_script},
          is_stream: true,
          method: 'registerSpendNtfn',
          type: 'chain',
        },
      ];

      const mismatches = [];

      for (const error of errors) {
        const {args, method, type} = error;

        // Streams fail with an error on the stream
        const failure = lnd => {
          // Exit early when the method is a stream
          if (!!error.is_stream) {
            return firstData({args, lnd, method, type});
          }

          return call({args, lnd, method, type});
        };

        const real = await failure(server.lnd);

        // Exit early when LND does not support the method
        if (!!real.err && unsupported.test(real.err.details)) {
          continue;
        }

        const mock = await failure(fake);

        const [mockDetails, realDetails] = [mock, real].map(({err}) => {
          return !!err && err.details;
        });

        // Every method that fails unlike LND is listed, not just the first
        if (mockDetails !== realDetails) {
          mismatches.push({
            mock: mockDetails,
            method: `${type}.${method}`,
            real: realDetails,
          });
        }
      }

      deepStrictEqual(mismatches, [], 'Methods fail like LND');
    });

    await t.test('Blocks from height 0 are told of like LND', async () => {
      // A fake LND with a chain that starts at height 0
      const zeroChain = makeLnd({chain: {blocks: [{}, {}, {}], height: 0}});

      // Subscribe from the block at height 0, and get where the first block is
      const firstBlock = async ({lnd}) => {
        const {res} = await call({
          lnd,
          args: {block_height: 0},
          method: 'getBlockHash',
          type: 'blocks',
        });

        const best = await call({
          lnd,
          args: {},
          method: 'getBestBlock',
          type: 'blocks',
        });

        const {data} = await firstData({
          lnd,
          args: {hash: res.block_hash, height: 0},
          method: 'registerBlockEpochNtfn',
          type: 'chain',
        });

        // Exit early when the first block is the tip of the node
        if (data.height === best.res.block_height) {
          return 'tip';
        }

        return data.height === 1 ? 'after height 0' : `height ${data.height}`;
      };

      const real = await firstBlock({lnd: server.lnd});
      const mock = await firstBlock({lnd: zeroChain});

      deepStrictEqual(mock, real, 'Height 0 is taken like LND');
    });

    await t.test('Repeated MuSig2 sessions start like LND', async () => {
      const nonce = Buffer.concat([Buffer.alloc(32, 4), Buffer.alloc(32, 5)]);

      const keys = [hexAsBuffer(server.id), fakeIdentity];

      // A public nonce of the other signer
      const otherNonce = Buffer.concat([client.id, first.id].map(hexAsBuffer));

      // Start a session, register a nonce, start it again, and register again
      const repeated = async ({key, lnd}) => {
        const args = {
          all_signer_pubkeys: keys,
          key_loc: identity,
          pregenerated_local_nonce: Buffer.concat([nonce, key]),
          version: musig2Version,
        };

        // Register the other nonce with a session, and get the error details
        const register = async session => {
          const {err} = await call({
            lnd,
            args: {
              other_signer_public_nonces: [otherNonce],
              session_id: session.res.session_id,
            },
            method: 'muSig2RegisterNonces',
            type: 'signer',
          });

          return !!err && err.details;
        };

        const started = await call({
          args,
          lnd,
          method: 'muSig2CreateSession',
          type: 'signer',
        });

        const registeredFirst = await register(started);

        const again = await call({
          args,
          lnd,
          method: 'muSig2CreateSession',
          type: 'signer',
        });

        const details = !!again.err && again.err.details;

        // Exit early when the session is not started again
        if (!!details) {
          return {details, registered_first: registeredFirst};
        }

        return {
          have_all_nonces: again.res.have_all_nonces,
          is_same_id: started.res.session_id.equals(again.res.session_id),
          registered: await register(again),
          registered_first: registeredFirst,
        };
      };

      const real = await repeated({key: keys[0], lnd: server.lnd});
      const mock = await repeated({key: keys[1], lnd: fake});

      // The first nonce registers, so the session has state to start over
      deepStrictEqual(real.registered_first, false, 'LND registers a nonce');

      deepStrictEqual(mock, real, 'Repeated sessions start like LND');
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
