# Mock LND

Create mocking versions of LND gRPC for use in unit tests.

A mock LND is a fake node: its identity, derived keys, shared keys and
signatures come from a node secret, and it can have peers, channels, a graph,
routes, invoices, onion messages, MuSig2 signing sessions and a chain of
blocks. Its responses are checked against the LND
protos, as the `lightning` package has them.

## Testing

`npm test` runs the unit tests, which check every response of the mock LND
against the LND protos and run the `lightning` methods against the mock LND.

`npm run integration-tests` compares the responses of the mock LND with the
responses of a real LND. It requires Docker.

## `makeForwardsResponse`

Make a forwardingHistory response

    {
      offset: <Paging Offset Number>
    }

    @returns
    <LND Forwards gRPC Response Object>

## `makeInvoice`

Lookup invoice mock response

An invoice is open, or held when it has payments, unless it is confirmed or
canceled. Payments share the amount of the invoice.

The preimage of the invoice hashes to its payment hash, and its payment
request is a request to pay the invoice, signed by the key of the default mock
LND. The invoice is created in 2024 and expires in 2100.

    {
      [description_hash]: <Description Hash Hex String>
      [is_canceled]: <Invoice is Canceled Bool>
      [is_confirmed]: <Invoice is Settled Bool>
      [is_push]: <Invoice is KeySend Bool>
      [payments]: [{
        [messages]: [{
          type: <Message Type Number String>
          value: <Message Value Hex String>
        }]
      }]
    }

    @throws
    <Error>

    @returns
    <LND Invoice gRPC Response Object>

## `makeInvoiceSubscription`

Make an invoice subscription

    {
      [invoice]: <Invoice Data Object>
    }

    @returns
    <EventEmitter Object>

## `makeLnd`

Make an LND mock object for testing

The node identity key is the public key of the node secret, which is 32 bytes
of 0x01 by default. Keys at other locators are derived from the node secret,
unless a secret is given for them. The next keys in a family are derived from
index 0, unless a next key index is given for the family.

Without `channels` there is a default channel, and without `routes` there is a
default route. When `routes` are given, a route is found among them that ends
at the destination and avoids ignored nodes and pairs. Routes do not depend on
channel balances.

Public keys are lowercase, as LND has them. The network is one of `mainnet`,
`regtest`, `signet`, `testnet` or `testnet4`.

Invoices that are added can be paid with `payInvoice`.

The node has a chain of blocks that build on each other, starting at the height
of the first block. Each block has a coinbase transaction before its
transactions. Without `chain`, there is one block at height 1. Published
transactions go to the mempool, and are mined with `mineBlocks`. A published
transaction that spends the same output as a transaction in the mempool
replaces it, and the transactions that spend its outputs are evicted. The chain
is reorganized with `reorgChain`. Chain notifier streams are told about blocks,
confirmations, spends and reorgs, as LND tells them. A blocks stream finds its
best block in the chain when it starts, on the next tick, and is told of the
blocks after it. Like LND, a best block at height 0 is ignored, and the stream
is told of the tip. A best block that a reorg took out is replayed from the
fork. Every stream is told about an update of the chain before any stream is
told about the next one, so blocks mined in a listener come after the blocks
before them in each stream. Each stream is told about an update as the chain
was when the update was made, even when a listener changes the chain. A
canceled stream is told about nothing more. `estimateFee` gives the fee rate of
the chain, at least LND's floor of 253 tokens per kiloweight.

MuSig2 sessions sign with BIP-327 MuSig2, which LND calls version 1.0.0rc2,
with sorted keys. Unlike LND, nonces come from the signing key and a count of
sessions, so they are the same every time a test runs. `signOutputRaw` signs
with the keys of the node. A key given by its public key, without a key
locator, is found when it is the identity key, a key in `keys` or a key from
`deriveNextKey`.

A method with a failure fails with an LND error after a count of calls that
succeed, and every call after that fails too. A stream fails on the next tick.
Failed calls are recorded.

Methods call back before they return. Streams are told about the node on the
next tick. Responses have their own bytes, as gRPC responses do.

Blinded invoices have paths in through active channels. When the graph
describes a channel peer, a path only starts at the peer if it signals route
blinding (feature bit 24 or 25) and has another channel, as LND requires.

Calls to the methods are recorded in `calls`. In strict mode, a response that
does not match the LND protos throws an error.

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
    <Mock Authenticated LND API Object>
    {
      calls: [{
        args: <RPC Arguments Object>
        [err]: <RPC Error Object>
        method: <RPC Method Name String>
        [response]: <RPC Response Object>
        [subscription]: <Stream EventEmitter Object>
        type: <Sub-Server Type String>
      }]
    }

The mock LND has these methods:

- `blocks`: `getBestBlock`, `getBlock`, `getBlockHash`, `getBlockHeader`
- `chain`: `registerBlockEpochNtfn`, `registerConfirmationsNtfn`,
    `registerSpendNtfn`
- `default`: `addInvoice`, `forwardingHistory`, `getChanInfo`, `getInfo`,
    `getNodeInfo`, `getTransactions`, `listChannels`, `listPeers`,
    `listUnspent`, `lookupInvoice`, `pendingChannels`, `queryRoutes`,
    `sendOnionMessage`, `subscribeInvoices`, `subscribeOnionMessages`
- `invoices`: `subscribeSingleInvoice`
- `router`: `sendPaymentV2`, `sendToRouteV2`
- `signer`: `deriveSharedKey`, `muSig2Cleanup`, `muSig2CombineKeys`,
    `muSig2CombineSig`, `muSig2CreateSession`, `muSig2RegisterNonces`,
    `muSig2Sign`, `signMessage`, `signOutputRaw`
- `version`: `getVersion`
- `wallet`: `deriveKey`, `deriveNextKey`, `estimateFee`, `finalizePsbt`,
    `fundPsbt`, `listUnspent`, `publishTransaction`, `releaseOutput`

Example:

```node
const {getIdentity} = require('ln-service');
const {makeLnd} = require('mock-lnd');

const lnd = makeLnd({peers: [{public_key: peer}], secret});

const {public_key} = await getIdentity({lnd});

// Messages that were sent
const sent = lnd.calls.filter(n => n.method === 'sendOnionMessage');
```

A method can fail after calls that succeed:

```node
const {makeLnd} = require('mock-lnd');

// The second and later MuSig2 sessions fail to start
const lnd = makeLnd({
  failures: [{
    after: 1,
    details: 'err',
    method: 'muSig2CreateSession',
    type: 'signer',
  }],
});
```

## `makeOnionMessage`

Make an onion message update, as LND gives a received onion message

The arguments are the message as `subscribeToMessages` describes it

    {
      encrypted: <Encrypted Recipient Data Hex String>
      key: <Path Key Hex String>
      [message]: {
        type: <Message Payload Record Type Number String>
        value: <Message Payload Hex String>
      }
      [onion]: <Onion Packet Hex String>
      [reply]: {
        inbound: [{
          encrypted_data: <Encrypted Data Hex String>
          relay_key: <Blinded Relay Key Hex String>
        }]
        introduction_node: <Introduction Node Public Key Hex String>
        key: <Path Key Hex String>
      }
      via: <Received From Peer Public Key Hex String>
    }

    @returns
    <OnionMessageUpdate Object>

## `makePaySubscription`

Make a payment subscription

    {
      [payment]: <Payment Data Object>
    }

    @returns
    <EventEmitter Object>

## `makePayViaRoutesResponse`

Make a response for send to route

    {
      [is_unknown_failure]: <Route is Failed Bool>
    }

    @returns
    <Paid Via Routes Response Object>

## `makePaymentData`

Make payment data

    {
      [htlcs]: [<HTLC Object>]
    }

    @returns
    <Payment Object>

## `makePaymentRequest`

Make a BOLT 11 payment request

    {
      ecp: <ECPair Signing Factory Object>
      [mtokens]: <Millitokens String>
    }

    @returns
    {
      request: <BOLT 11 Payment Request String>
    }

## `makeRpcError`

Make an error as the gRPC client gives an error from LND

    {
      [code]: <gRPC Status Code Number>
      details: <Error Details String>
    }

    @returns
    <gRPC Error Object>

## `makeWalletVersionResponse`

Make a response for getVersion

    {
      [hash]: <Override Commit Hash Hex String>
    }

    @returns
    <GetVersion Response Object>

## `mineBlocks`

Mine blocks on the chain of a fake LND

The first block confirms the transactions in the mempool, and then the
transactions. Blocks after the first block only have a coinbase.

Transactions are not mined twice, and do not spend an output that another
transaction in the block or in the chain spends.

Streams of blocks, confirmations and spends are told about the blocks.

    {
      [count]: <Count of Blocks to Mine Number>
      lnd: <Fake LND Object>
      [transactions]: [<Raw Transaction Hex String>]
    }

    @throws
    <Error>

    @returns
    {
      blocks: [{
        height: <Block Height Number>
        id: <Block Id Hex String>
      }]
    }

Example:

```node
const {broadcastChainTransaction} = require('ln-service');
const {makeLnd} = require('mock-lnd');
const {mineBlocks} = require('mock-lnd');

const lnd = makeLnd({chain: {height: 100}});

await broadcastChainTransaction({lnd, transaction});

// The transaction is confirmed in block 101, with 6 confirmations at 106
mineBlocks({lnd, count: 6});
```

## `payInvoice`

Pay an invoice of a fake LND, as when the node receives a payment for it

The invoice is settled with an HTLC over the first channel of the node, and
the invoice subscriptions of the node are updated with the settled invoice.

Like LND, an invoice is not paid with less than its amount, or after it has
expired.

    {
      [id]: <Invoice Payment Hash Hex String>
      [index]: <Invoice Add Index Number>
      lnd: <Fake LND Object>
      [mtokens]: <Received Millitokens String>
    }

    @throws
    <Error>

Example:

```node
const {createInvoice} = require('ln-service');
const {makeLnd} = require('mock-lnd');
const {payInvoice} = require('mock-lnd');

const lnd = makeLnd({});

const {id} = await createInvoice({lnd, tokens: 1});

// The invoice is paid, and subscriptions to invoices are told about it
payInvoice({id, lnd});
```

## `reorgChain`

Reorganize the chain of a fake LND, replacing the blocks from a height with
more blocks, as a chain backend switches to a chain with more work

Without blocks, the blocks are replaced with one more block than the blocks
that are replaced, with only coinbase transactions.

Transactions of replaced blocks that are not in the new blocks go back to the
mempool. Replaced blocks can still be gotten by their hashes.

Transactions of the new blocks are not repeated, are not in the blocks that
are kept, and do not spend an output that another transaction in the new
blocks or the blocks that are kept spends.

Streams of blocks are told about the new blocks. Streams of confirmations and
spends are told of a reorg when their block is replaced.

    {
      [blocks]: [{
        [transactions]: [<Raw Transaction Hex String>]
      }]
      height: <Height of the First Replaced Block Number>
      lnd: <Fake LND Object>
    }

    @throws
    <Error>

    @returns
    {
      blocks: [{
        height: <Block Height Number>
        id: <Block Id Hex String>
      }]
    }
