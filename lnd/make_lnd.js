const blocksMethods = require('./blocks_methods');
const chainMethods = require('./chain_methods');
const defaultMethods = require('./default_methods');
const fakeNodes = require('./fake_nodes');
const invoicesMethods = require('./invoices_methods');
const {makeNode} = require('./../node');
const musig2Methods = require('./musig2_methods');
const routerMethods = require('./router_methods');
const signerMethods = require('./signer_methods');
const versionMethods = require('./version_methods');
const walletMethods = require('./wallet_methods');
const wrapMethod = require('./wrap_method');

const {entries} = Object;

/** Make an LND mock object for testing

  The mock is a node with a private key: its identity, derived keys, shared
  keys and signatures all come from the node secret. Keys at locators other
  than the identity at family 6 index 0 are derived from the node secret,
  unless a secret is given for them. The next keys in a family are derived
  from index 0, unless a next key index is given for the family.

  Without `channels`, there is a default channel. Without `routes`, there is a
  default route. When `routes` are given, a route is found among them that
  ends at the destination and avoids ignored nodes and pairs. Routes do not
  depend on channel balances.

  Public keys are lowercase, as LND has them.

  Invoices that are added can be paid with `payInvoice`.

  Calls to methods are recorded in `calls`. In strict mode, responses throw an
  error when they do not match the LND protos.

  {
    [chain]: {
      [blocks]: [{
        [transactions]: [<Raw Transaction Hex String>]
      }]
      [fee_tokens_per_vbyte]: <Chain Fee Tokens Per Virtual Byte Number>
      [height]: <Height of the First Block Number>
    }
    [channels]: [{
      [capacity]: <Channel Capacity Tokens Number>
      [id]: <Standard Format Channel Id String>
      [is_active]: <Channel Is Active Bool>
      [is_private]: <Channel Is Private Bool>
      [local_balance]: <Local Balance Tokens Number>
      [other_ids]: [<Other Standard Format Channel Id String>]
      partner_public_key: <Peer Public Key Hex String>
      [remote_balance]: <Remote Balance Tokens Number>
      [transaction_id]: <Funding Transaction Id Hex String>
      [transaction_vout]: <Funding Transaction Output Index Number>
    }]
    [failures]: [{
      [after]: <Count of Calls That Succeed Before Failing Number>
      [code]: <gRPC Status Code Number>
      details: <Error Details String>
      method: <RPC Method Name String>
      type: <Sub-Server Type String>
    }]
    [features]: [<Node Feature Bit Number>]
    [fundPsbt]: <Override Fund PSBT Function>
    [getChainTransactions]: <Override Get Chain Transactions Function>
    [getChannels]: <Override Get Channels Response Function>
    [getForwards]: <Override Get Forwards Response Function>
    [getInvoice]: <Override Get Invoice Response Function>
    [getUtxos]: <Override Get Utxos Response Function>
    [getWalletVersion]: <Override Get Wallet Version Response Function>
    [graph]: {
      [channels]: [{
        [capacity]: <Channel Capacity Tokens Number>
        id: <Standard Format Channel Id String>
        policies: [{
          [base_fee_mtokens]: <Base Fee Millitokens String>
          [cltv_delta]: <Locktime Delta Number>
          [fee_rate]: <Fees Charged Per Million Millitokens Number>
          [is_disabled]: <Channel Is Disabled Bool>
          [max_htlc_mtokens]: <Maximum HTLC Millitokens Value String>
          [min_htlc_mtokens]: <Minimum HTLC Millitokens Value String>
          public_key: <Node Public Key Hex String>
        }]
        [transaction_id]: <Funding Transaction Id Hex String>
        [transaction_vout]: <Funding Transaction Output Index Number>
      }]
      [nodes]: [{
        [alias]: <Node Alias String>
        [color]: <Node Color String>
        [features]: [<Feature Bit Number>]
        public_key: <Node Public Key Hex String>
        [sockets]: [<Host and Port String>]
      }]
    }
    [is_strict]: <Check Responses Match LND Protos Bool>
    [keys]: [{
      family: <Key Family Number>
      index: <Key Index Number>
      secret: <Private Key Hex String>
    }]
    [network]: <Network Name String>
    [next_key_indexes]: [{
      family: <Key Family Number>
      index: <Next Key Index Number>
    }]
    [payViaRoutes]: <Override Pay Via Routes Function>
    [peers]: [{
      [features]: [<Feature Bit Number>]
      [is_inbound]: <Peer Connected Inbound Bool>
      public_key: <Peer Public Key Hex String>
      [socket]: <Peer Network Address String>
    }]
    [routes]: [{
      hops: [{
        [channel]: <Standard Format Channel Id String>
        public_key: <Hop Public Key Hex String>
      }]
    }]
    [secret]: <Node Identity Private Key Hex String>
    [signPsbt]: <Override Sign PSBT Function>
    [subscribeToInvoice]: <Override Subscribe to Invoice Emitter>
    [subscribeToPay]: <Override Subscribe to Pay Emitter>
  }

  @throws
  <Error>

  @returns
  {
    calls: [{
      args: <RPC Arguments Object>
      [err]: <RPC Error Object>
      method: <RPC Method Name String>
      [response]: <RPC Response Object>
      [subscription]: <Stream EventEmitter Object>
      type: <Sub-Server Type String>
    }]
    blocks: {
      getBestBlock: ({}, cbk) => {}
      getBlock: ({}, cbk) => {}
      getBlockHash: ({}, cbk) => {}
      getBlockHeader: ({}, cbk) => {}
    }
    chain: {
      registerBlockEpochNtfn: ({}) => {}
      registerConfirmationsNtfn: ({}) => {}
      registerSpendNtfn: ({}) => {}
    }
    default: {
      addInvoice: ({}, cbk) => {}
      forwardingHistory: ({}, cbk) => {}
      getChanInfo: ({}, cbk) => {}
      getInfo: ({}, cbk) => {}
      getNodeInfo: ({}, cbk) => {}
      getTransactions: ({}, cbk) => {}
      listChannels: ({}, cbk) => {}
      listPeers: ({}, cbk) => {}
      listUnspent: ({}, cbk) => {}
      lookupInvoice: ({}, cbk) => {}
      pendingChannels: ({}, cbk) => {}
      queryRoutes: ({}, cbk) => {}
      sendOnionMessage: ({}, cbk) => {}
      subscribeInvoices: ({}) => {}
      subscribeOnionMessages: ({}) => {}
    }
    invoices: {
      subscribeSingleInvoice: ({}) => {}
    }
    router: {
      sendPaymentV2: ({}) => {}
      sendToRouteV2: ({}, cbk) => {}
    }
    signer: {
      deriveSharedKey: ({}, cbk) => {}
      muSig2Cleanup: ({}, cbk) => {}
      muSig2CombineKeys: ({}, cbk) => {}
      muSig2CombineSig: ({}, cbk) => {}
      muSig2CreateSession: ({}, cbk) => {}
      muSig2RegisterNonces: ({}, cbk) => {}
      muSig2Sign: ({}, cbk) => {}
      signMessage: ({}, cbk) => {}
      signOutputRaw: ({}, cbk) => {}
    }
    version: {
      getVersion: ({}, cbk) => {}
    }
    wallet: {
      deriveKey: ({}, cbk) => {}
      deriveNextKey: ({}, cbk) => {}
      estimateFee: ({}, cbk) => {}
      finalizePsbt: ({}, cbk) => {}
      fundPsbt: ({}, cbk) => {}
      listUnspent: ({}, cbk) => {}
      publishTransaction: ({}, cbk) => {}
      releaseOutput: ({}, cbk) => {}
    }
  }
*/
module.exports = args => {
  const overrides = args || {};

  const node = makeNode(overrides);

  const lnd = {
    blocks: blocksMethods({node}),
    chain: chainMethods({node}),
    default: defaultMethods({node, overrides}),
    invoices: invoicesMethods({node, overrides}),
    router: routerMethods({overrides}),
    signer: {...signerMethods({node}), ...musig2Methods({node})},
    version: versionMethods({overrides}),
    wallet: walletMethods({node, overrides}),
  };

  // Calls are recorded, and responses are checked in strict mode
  entries(lnd).forEach(([type, methods]) => {
    return entries(methods).forEach(([method, fn]) => {
      const failures = node.failures.filter(failure => {
        return failure.method === method && failure.type === type;
      });

      methods[method] = wrapMethod({
        failures,
        fn,
        method,
        type,
        calls: node.calls,
        is_strict: !!overrides.is_strict,
        streams: node.streams,
      });
    });
  });

  const unknown = node.failures.find(failure => {
    const methods = lnd[failure.type] || {};

    return !methods[failure.method];
  });

  // Failures are of methods of the fake LND
  if (!!unknown) {
    throw new Error('ExpectedKnownMethodForFailureToMakeLnd');
  }

  lnd.calls = node.calls;

  // The fake node of the LND is known to helpers like paying an invoice
  fakeNodes.set(lnd, node);

  return lnd;
};
