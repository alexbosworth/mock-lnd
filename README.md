# Mock LND

Create mocking versions of LND gRPC for use in unit tests.

## `makeForwardsResponse`

Make a forwardingHistory response

    {
      offset: <Paging Offset Number>
    }

    @returns
    <LND Forwards gRPC Response Object>

## `makeInvoice`

Lookup invoice mock response

    {
      [description_hash]: <Description Hash Hex String>
      [is_confirmed]: <Invoice is Settled Bool>
      [is_push]: <Invoice is KeySend Bool>
      [payments]: [<Payment Object>]
    }

    @returns
    <LND Invoice gRPC Response Object>

## `makeInvoiceSubscription`

Make an invoice subscription

    {
      invoice: <Invoice Data Object>
    }

    @returns
    <EventEmitter Object>

## `makeLnd`

Make an LND mock object for testing

    {
      getForwards: <Override Get Forwards Response Function>
      getInvoice: <Override Get Invoice Response Function>
      subscribeToInvoice: <Override Subscribe to Invoice Emitter>
      subscribeToPay: <Override Subscribe to Pay Emitter>
    }

    @returns
    <Mock Authenticated LND API Object>

## `makePaySubscription`

Make a payment subscription

    {
      [payment]: <Payment Data Object>
    }

    @returns
    <EventEmitter Object>

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
      [mtokens]: <Millitokens String>
    }

    @returns
    {
      request: <BOLT 11 Payment Request String>
    }

