# Mock LND

Create mocking versions of LND gRPC for use in unit tests.

A mock LND is a fake node: its identity, derived keys, shared keys and
signatures come from a node secret, and it can have peers, channels, a graph,
routes, invoices and onion messages. Its responses are checked against the LND
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

Blinded invoices have paths in through active channels. When the graph
describes a channel peer, a path only starts at the peer if it signals route
blinding (feature bit 24 or 25) and has another channel, as LND requires.

Calls to the methods are recorded in `calls`. In strict mode, a response that
does not match the LND protos throws an error.

    {
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

- `chain`: `registerBlockEpochNtfn`
- `default`: `addInvoice`, `forwardingHistory`, `getChanInfo`, `getInfo`,
    `getNodeInfo`, `getTransactions`, `listChannels`, `listPeers`,
    `listUnspent`, `lookupInvoice`, `pendingChannels`, `queryRoutes`,
    `sendOnionMessage`, `subscribeInvoices`, `subscribeOnionMessages`
- `invoices`: `subscribeSingleInvoice`
- `router`: `sendPaymentV2`, `sendToRouteV2`
- `signer`: `deriveSharedKey`, `signMessage`
- `version`: `getVersion`
- `wallet`: `deriveKey`, `deriveNextKey`, `estimateFee`, `finalizePsbt`,
    `fundPsbt`, `listUnspent`, `releaseOutput`

Example:

```node
const {getIdentity} = require('ln-service');
const {makeLnd} = require('mock-lnd');

const lnd = makeLnd({peers: [{public_key: peer}], secret});

const {public_key} = await getIdentity({lnd});

// Messages that were sent
const sent = lnd.calls.filter(n => n.method === 'sendOnionMessage');
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
