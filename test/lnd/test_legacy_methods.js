const EventEmitter = require('node:events');
const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const lightning = require('lightning');

const {makeForwardsResponse} = require('./../../');
const {makeInvoice} = require('./../../');
const {makeLnd} = require('./../../');
const {makePayViaRoutesResponse} = require('./../../');
const {makePaymentData} = require('./../../');
const {makeWalletVersionResponse} = require('./../../');

const address = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const id = Buffer.alloc(32).toString('hex');
const psbt = '70736274ff01009a020000000258e87a21b56daf0c23be8e7070456c336f7cbaa5c8757924f545887bb2abdd750000000000ffffffff838d0427d0ec650a68aa46bb0b098aea4422c071b2ca78352a077959d07cea1d0100000000ffffffff0270aaf00800000000160014d85c2b71d0060b09c9886aeb815e50991dda124d00e1f5050000000016001400aea9a2e5f0f876a588df5546e8742d1d87008f000000000000000000';
const strictLnd = () => ({lnd: makeLnd({is_strict: true})});

// Wait for the first of some events on an emitter
const firstEvent = (emitter, eventNames) => {
  return new Promise((resolve, reject) => {
    emitter.once('error', reject);

    eventNames.forEach(eventName => {
      return emitter.once(eventName, data => resolve({data, eventName}));
    });
  });
};

// Call a method of a fake LND, and get the error or response of the call
const callRpc = ({lnd, path}) => {
  const [type, method] = path.split('.');

  return new Promise(resolve => {
    return lnd[type][method]({index_offset: 0}, (err, res) => {
      return resolve({err, res});
    });
  });
};

// Make a fake LND with overrides, and get what it gives for the overrides
const overridden = async ({}) => {
  const invoiceSub = new EventEmitter();
  const paySub = new EventEmitter();

  const lnd = makeLnd({
    fundPsbt: (args, cbk) => cbk('fund'),
    getChainTransactions: ({}, cbk) => cbk(null, {transactions: []}),
    getChannels: ({}, cbk) => cbk(null, {channels: []}),
    getForwards: ({}, cbk) => cbk(null, makeForwardsResponse({offset: 1})),
    getInvoice: ({}, cbk) => cbk(null, makeInvoice({is_confirmed: true})),
    getUtxos: ({}, cbk) => cbk(null, {utxos: []}),
    getWalletVersion: ({}, cbk) => {
      return cbk(null, makeWalletVersionResponse({hash: 'ff'.repeat(20)}));
    },
    is_strict: true,
    payViaRoutes: ({}, cbk) => {
      return cbk(null, makePayViaRoutesResponse({is_unknown_failure: true}));
    },
    signPsbt: (args, cbk) => cbk('sign'),
    subscribeToInvoice: invoiceSub,
    subscribeToPay: paySub,
  });

  const {channels} = await lightning.getChannels({lnd});
  const {forwards} = await lightning.getForwards({lnd});
  const invoice = await lightning.getInvoice({id, lnd});
  const {transactions} = await lightning.getChainTransactions({lnd});
  const {utxos} = await lightning.getUtxos({lnd});
  const version = await lightning.getWalletVersion({lnd});

  // Data on overridden streams is checked against the protos
  invoiceSub.emit('data', makeInvoice({}));
  paySub.emit('data', makePaymentData({}));

  const forwarding = await callRpc({lnd, path: 'default.forwardingHistory'});
  const fund = await callRpc({lnd, path: 'wallet.fundPsbt'});
  const route = await callRpc({lnd, path: 'router.sendToRouteV2'});
  const sign = await callRpc({lnd, path: 'wallet.finalizePsbt'});

  return {
    channels,
    forwards,
    transactions,
    utxos,
    commit_hash: version.commit_hash,
    fund_error: fund.err,
    invoice_stream: lnd.invoices.subscribeSingleInvoice({}) === invoiceSub,
    is_confirmed: invoice.is_confirmed,
    last_offset_index: forwarding.res.last_offset_index,
    pay_stream: lnd.router.sendPaymentV2({}) === paySub,
    route_status: route.res.status,
    sign_error: sign.err,
  };
};

const tests = [
  {
    args: strictLnd(),
    description: 'Chain fee rate works in strict mode',
    expected: {tokens_per_vbyte: 1},
    method: lightning.getChainFeeRate,
  },
  {
    args: strictLnd(),
    description: 'Chain transactions work in strict mode',
    expected: 1,
    method: async ({lnd}) => {
      return (await lightning.getChainTransactions({lnd})).transactions.length;
    },
  },
  {
    args: strictLnd(),
    description: 'Forwards work in strict mode',
    expected: 1,
    method: async ({lnd}) => {
      return (await lightning.getForwards({lnd})).forwards.length;
    },
  },
  {
    args: strictLnd(),
    description: 'Height works in strict mode',
    expected: 1,
    method: async ({lnd}) => {
      return (await lightning.getHeight({lnd})).current_block_height;
    },
  },
  {
    args: strictLnd(),
    description: 'Invoice works in strict mode',
    expected: false,
    method: async ({lnd}) => {
      return (await lightning.getInvoice({id, lnd})).is_confirmed;
    },
  },
  {
    args: strictLnd(),
    description: 'Pending channels work in strict mode',
    expected: {pending_channels: []},
    method: lightning.getPendingChannels,
  },
  {
    args: strictLnd(),
    description: 'UTXOs work in strict mode',
    expected: 1,
    method: async ({lnd}) => (await lightning.getUtxos({lnd})).utxos.length,
  },
  {
    args: strictLnd(),
    description: 'Wallet version works in strict mode',
    expected: '0'.repeat(40),
    method: async ({lnd}) => {
      return (await lightning.getWalletVersion({lnd})).commit_hash;
    },
  },
  {
    args: strictLnd(),
    description: 'Fund PSBT works in strict mode',
    expected: 2,
    method: async ({lnd}) => {
      const outputs = [{address, tokens: 1}];

      return (await lightning.fundPsbt({lnd, outputs})).inputs.length;
    },
  },
  {
    args: strictLnd(),
    description: 'Sign PSBT works in strict mode',
    expected: true,
    method: async ({lnd}) => !!(await lightning.signPsbt({lnd, psbt})).psbt,
  },
  {
    args: {...strictLnd(), id, transaction_id: id, transaction_vout: 0},
    description: 'Unlock UTXO works in strict mode',
    expected: undefined,
    method: lightning.unlockUtxo,
  },
  {
    args: strictLnd(),
    description: 'Pay via routes works in strict mode',
    expected: id,
    method: async ({lnd}) => {
      const {route} = await lightning.getRouteToDestination({
        lnd,
        destination: Buffer.alloc(33, 3).toString('hex'),
        tokens: 1,
      });

      const paid = await lightning.payViaRoutes({id, lnd, routes: [route]});

      return paid.secret;
    },
  },
  {
    args: strictLnd(),
    description: 'Blocks subscription works in strict mode',
    expected: 1,
    method: async ({lnd}) => {
      const sub = lightning.subscribeToBlocks({lnd});

      const {data} = await firstEvent(sub, ['block']);

      sub.removeAllListeners();

      return data.height;
    },
  },
  {
    args: strictLnd(),
    description: 'Invoice subscription works in strict mode',
    expected: 'invoice_updated',
    method: async ({lnd}) => {
      const sub = lightning.subscribeToInvoice({id, lnd});

      const {eventName} = await firstEvent(sub, ['invoice_updated']);

      sub.removeAllListeners();

      return eventName;
    },
  },
  {
    args: strictLnd(),
    description: 'Pay subscription works in strict mode',
    expected: 'confirmed',
    method: async ({lnd}) => {
      const request = makeInvoice({}).payment_request;

      const sub = lightning.subscribeToPayViaRequest({lnd, request});

      const {eventName} = await firstEvent(sub, ['confirmed', 'failed']);

      sub.removeAllListeners();

      return eventName;
    },
  },
  {
    args: {},
    description: 'Overrides respond in place of the fake LND',
    expected: {
      channels: [],
      commit_hash: 'ff'.repeat(20),
      forwards: [],
      fund_error: 'fund',
      invoice_stream: true,
      is_confirmed: true,
      last_offset_index: 1,
      pay_stream: true,
      route_status: 'FAILED',
      sign_error: 'sign',
      transactions: [],
      utxos: [],
    },
    method: overridden,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, async () => {
    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
