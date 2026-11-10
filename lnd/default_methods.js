const {chanNumber} = require('bolt07');

const {deriveKey} = require('./../node');
const {invoiceStreams} = require('./../node');
const {makeChanInfoResponse} = require('./../data');
const {makeForwardsResponse} = require('./../data');
const {makeGetChainTxResponse} = require('./../data');
const {makeGetChannelsResponse} = require('./../data');
const {makeGetPendingChanResponse} = require('./../data');
const {makeGetUtxosResponse} = require('./../data');
const {makeInvoice} = require('./../data');
const {makeInvoiceRecord} = require('./../node');
const {makeListPeersResponse} = require('./../data');
const {makeNodeInfoResponse} = require('./../data');
const {makeRoutesResponse} = require('./../data');
const {makeRpcError} = require('./../data');
const {makeRpcRoute} = require('./../data');
const makeStream = require('./make_stream');
const {makeWalletInfoResponse} = require('./../data');
const {routeForQuery} = require('./../node');
const {updateInvoiceStreams} = require('./../node');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const duplicateInvoice = 'invoice with payment hash already exists';
const edgeNotFound = 'edge not found';
const identityFamily = 6;
const identityIndex = 0;
const isAmount = n => !!n && !/^0*$/.test(String(n));
const lower = key => String(key || '').toLowerCase();
const mtokensPerToken = BigInt(1e3);
const mutuallyExclusiveAmounts = 'sat and msat arguments are mutually exclusive';
const nodeNotFound = 'unable to find node';
const noRoute = 'unable to find a path to destination';
const {nextTick} = process;
const notConnected = 'peer is not connected';

/** Make the methods of the default Lightning sub-server of a fake node

  {
    node: <Fake Node Object>
    overrides: <Method Overrides Object>
  }

  @returns
  {
    <Method Name String>: <RPC Method Function>
  }
*/
module.exports = ({node, overrides}) => {
  const listChannels = () => {
    return makeGetChannelsResponse({channels: node.channels}).channels;
  };

  return {
    addInvoice: (args, cbk) => {
      // Exit early when an amount is given in tokens and in millitokens
      if (isAmount(args.value) && isAmount(args.value_msat)) {
        return cbk(makeRpcError({details: mutuallyExclusiveAmounts}));
      }

      const key = deriveKey({
        family: identityFamily,
        index: identityIndex,
        keys: node.keys,
        secret: node.secret,
      });

      let invoice;

      try {
        invoice = makeInvoiceRecord({
          add_index: node.invoices.length + 1,
          channels: listChannels(),
          graph: node.graph,
          identity: node.identity,
          network: node.network,
          private_key: key.private_key,
          request: args,
          secret: node.secret,
        })
        .invoice;
      } catch (err) {
        return cbk(makeRpcError({details: err.message}));
      }

      // Exit early when there is already an invoice with the payment hash
      if (node.invoices.some(n => n.r_hash.equals(invoice.r_hash))) {
        return cbk(makeRpcError({details: duplicateInvoice}));
      }

      node.invoices.push(invoice);

      // The streams subscribed to when the invoice is added are told of it
      const {streams} = invoiceStreams({node, hash: invoice.r_hash});

      nextTick(() => updateInvoiceStreams({invoice, streams}));

      return cbk(null, {
        add_index: invoice.add_index,
        payment_addr: invoice.payment_addr,
        payment_request: invoice.payment_request,
        r_hash: invoice.r_hash,
      });
    },
    forwardingHistory: (args, cbk) => {
      // Exit early when there is a custom forwards response
      if (!!overrides.getForwards) {
        return overrides.getForwards({offset: args.index_offset}, cbk);
      }

      return cbk(null, makeForwardsResponse({offset: args.index_offset}));
    },
    getChanInfo: (args, cbk) => {
      const id = String(args.chan_id);

      const channel = node.graph.channels.find(channel => {
        return chanNumber({channel: channel.id}).number === id;
      });

      // Exit early when the channel is not in the graph
      if (!channel) {
        return cbk(makeRpcError({details: edgeNotFound}));
      }

      return cbk(null, makeChanInfoResponse({channel}));
    },
    getInfo: ({}, cbk) => {
      return cbk(null, makeWalletInfoResponse({
        channels: listChannels(),
        features: node.features,
        identity: node.identity,
        network: node.network,
        peers: node.peers,
      }));
    },
    getNodeInfo: (args, cbk) => {
      const publicKey = lower(args.pub_key);

      const graphNode = node.graph.nodes.find(n => n.public_key === publicKey);

      // Exit early when the node is not in the graph
      if (!graphNode) {
        return cbk(makeRpcError({details: nodeNotFound}));
      }

      return cbk(null, makeNodeInfoResponse({
        channels: node.graph.channels,
        is_including_channels: !!args.include_channels,
        node: graphNode,
      }));
    },
    getTransactions: ({}, cbk) => {
      // Exit early when there is a custom transactions response
      if (!!overrides.getChainTransactions) {
        return overrides.getChainTransactions({}, cbk);
      }

      return cbk(null, makeGetChainTxResponse({}));
    },
    listChannels: ({}, cbk) => {
      // Exit early when there is a custom channels response
      if (!!overrides.getChannels) {
        return overrides.getChannels({}, cbk);
      }

      return cbk(null, {channels: listChannels()});
    },
    listPeers: ({}, cbk) => {
      return cbk(null, makeListPeersResponse({peers: node.peers}));
    },
    listUnspent: ({}, cbk) => {
      // Exit early when there is a custom utxos response
      if (!!overrides.getUtxos) {
        return overrides.getUtxos({}, cbk);
      }

      return cbk(null, makeGetUtxosResponse({}));
    },
    lookupInvoice: (args, cbk) => {
      const id = bufferAsHex(args.r_hash);

      // Exit early when there is a custom invoice response
      if (!!overrides.getInvoice) {
        return overrides.getInvoice({id}, cbk);
      }

      const invoice = node.invoices.find(n => bufferAsHex(n.r_hash) === id);

      return cbk(null, invoice || makeInvoice({}));
    },
    pendingChannels: ({}, cbk) => cbk(null, makeGetPendingChanResponse({})),
    queryRoutes: (args, cbk) => {
      // Exit early when there are no routes given to find routes among
      if (!node.routes) {
        return cbk(null, makeRoutesResponse({}));
      }

      const {route} = routeForQuery({
        ignored_nodes: args.ignored_nodes,
        ignored_pairs: args.ignored_pairs,
        pub_key: lower(args.pub_key),
        routes: node.routes,
        source: lower(args.source_pub_key) || node.identity,
      });

      // Exit early when there is no route to the destination
      if (!route) {
        return cbk(makeRpcError({details: noRoute}));
      }

      const amount = BigInt(args.amt || 0) * mtokensPerToken;

      const mtokens = BigInt(args.amt_msat || 0) || amount;

      return cbk(null, {
        routes: [makeRpcRoute({hops: route.hops, mtokens: String(mtokens)})],
        success_prob: 1,
      });
    },
    sendOnionMessage: (args, cbk) => {
      const peer = bufferAsHex(args.peer || []);

      // Exit early when the message is not sent to a connected peer
      if (!node.peers.find(n => n.public_key === peer)) {
        return cbk(makeRpcError({details: notConnected}));
      }

      return cbk(null, {status: ''});
    },
    subscribeInvoices: ({}) => makeStream({}),
    subscribeOnionMessages: ({}) => makeStream({}),
  };
};
