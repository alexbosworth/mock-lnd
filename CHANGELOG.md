# Versions

## 5.0.0

- `makeInvoice`: Add `is_canceled`
- `makeInvoice`: Fix payment records with types of 2^63 and above
- `makeLnd`: Add `calls`, `channels`, `features`, `graph`, `is_strict`, `keys`,
    `network`, `next_key_indexes`, `peers`, `routes` and `secret`
- `makeLnd`: Add `deriveKey`, `deriveNextKey`, `deriveSharedKey`,
    `getChanInfo`, `getNodeInfo`, `listPeers`, `sendOnionMessage`,
    `signMessage`, `subscribeInvoices` and `subscribeOnionMessages`
- `makeLnd`: Fix a failing `getUtxos` override being bypassed
- `makeLnd`: Follow LND rules for where blinded paths start
- `makeLnd`: Pass arguments to `fundPsbt` and `signPsbt` overrides
- `makeOnionMessage`: Add method to make a received onion message
- `makePaySubscription`: Add `cancel`
- `makeRpcError`: Add method to make an LND gRPC error
- `payInvoice`: Add method to pay an invoice

### Breaking Changes

- `makeInvoice`: Default to an open, unpaid invoice
- `makeInvoice`, `makeLnd`: Invoices have LND feature bits 8, 14, 17 and 25
- `makeLnd`: `addInvoice` stores invoices and responds like LND
- `makeLnd`: Derive the identity key from `secret`
- `makeLnd`: Remove `router.sendToRoute`
- Responses match the LND protos

## 4.0.1

- Require node v22 or higher

## 3.0.0

- Require node v20 or higher

## 2.0.0

### Breaking Changes

- Require node v18 or higher
- `makePaymentRequest`: Ecpair factory argument `ecp` is now required

## 1.4.4

- `makeLnd`: Support previous outpoints in chain transactions

## 1.4.3

- `makeLnd`: Fix support for confirmed invoices

## 1.4.2

- `makeLnd`: Fix support for channel list past LND 0.15.0

## 1.4.1

- `makeLnd`: Add support for `getChainTransactions` method and override
- `makeLnd`: Add support for `getChannels` method and override
- `makeLnd`: Add support for `getPendingChannels` method
- `makeLnd`: Add support for `getUtxos` method and override

## 1.3.0

- `makeLnd`: Add support for `fundPsbt` method and override
- `makeLnd`: Add support for `getChainFeeRate` method
- `makeLnd`: Add support for `getWalletVersion` method and override
- `makeLnd`: Add support for `signPsbt` method
- `makeLnd`: Add support for `unlockUtxo` method
- `makeWalletVersionResponse`: Add method to create a wallet version

## 1.2.1

- `makeLnd`: Add support for forwards and add `payViaRoutes` override
- `makePayViaRoutesResponse`: Add method to make pay via routes response

## 1.1.0

- `makeForwardsResponse`: Add method to create a forwards response
- `makeLnd`: Add support for forwards and add `getForwards` override

## 1.0.1

- `makeInvoice`: Add method to make an invoice message
- `makeInvoiceSubscription`: Add method to make an invoice subscription
- `makeLnd`: Add method to make a mock LND Authenticated gRPC object
- `makePaySubscription`: Add method to make a pay subscription
- `makePaymentData`: Add method to make a payment data message
- `makePaymentRequest`: Add method to construct a payment request
