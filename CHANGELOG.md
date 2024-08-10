# Versions

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
