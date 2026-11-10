const {createHash} = require('node:crypto');

const {createSignedRequest} = require('invoices');
const {createUnsignedRequest} = require('invoices');
const {pointFromScalar} = require('tiny-secp256k1');
const {sign} = require('tiny-secp256k1');

const makeFeatures = require('./make_features');
const typeAsKey = require('./type_as_key');

const acceptedState = 'ACCEPTED';
const addressTag = Buffer.from('addr');
const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const canceledState = 'CANCELED';
const cltvDelta = 1;
const createdAt = Date.parse('2024-01-01T00:00:00.000Z') / 1e3;
const defaultDescHash = Buffer.alloc(0);
const expiresAt = Date.parse('2100-01-01T00:00:00.000Z') / 1e3;
const featureBits = [8, 14, 17, 25];
const hexAsBuf = hex => !!hex ? Buffer.from(hex, 'hex') : undefined;
const msPerSecond = 1e3;
const mtokens = '1000';
const network = 'testnet';
const openState = 'OPEN';
const preimage = Buffer.alloc(32);
const settledState = 'SETTLED';
const sha256 = n => createHash('sha256').update(n).digest();
const signingKey = Buffer.alloc(32, 1);
const tokens = '1';

/** Lookup invoice mock response

  An invoice is open, or held when it has payments, unless it is confirmed or
  canceled. Payments share the amount of the invoice.

  The preimage of the invoice hashes to its payment hash, and its payment
  request is a request to pay the invoice, signed by the key of the default
  mock LND. The invoice is created in 2024 and expires in 2100.

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
  {
    add_index: <Invoice Added Index String>
    amt_paid_msat: <Amount Received Millitokens String>
    amt_paid_sat: <Amount Received Tokens String>
    cltv_expiry: <CLTV Expiration Delta String>
    creation_date: <Creation Date Epoch Seconds String>
    description_hash: <Description Hash Buffer Object>
    expiry: <Payment Expiration Seconds String>
    fallback_addr: <On-Chain Fallback Address String>
    features: {
      <Feature Number>: {
        is_known: <Feature Is Known Bool>
        is_required: <Feature Is Required Bool>
        name: <Feature Name String>
      }
    }
    htlcs: [{
      accept_height: <HTLC Held Since Height Number>
      accept_time: <HTLC Held Since Epoch Time Number String>
      amt_msat: <HTLC Amount Millitokens String>
      chan_id: <Numeric Channel Id String>
      custom_records: {
        <UInt64 String>: <Record Data Buffer>
      }
      expiry_height: <HTLC CLTV Expiration Height Number>
      htlc_index: <Channel HTLC Index Number String>
      mpp_total_amt_msat: <Total Payment Millitokens String>
      resolve_time: <HTLC Removed At Epoch Time Number String>
      state: <HTLC Lifecycle State String>
    }]
    is_keysend: <Invoice Was Push Payment Bool>
    memo: <Memo String>
    payment_addr: <Payment Address Buffer Object>
    payment_request: <BOLT 11 Payment Request String>
    private: <Invoice Includes Routing Hints Bool>
    r_hash: <Preimage Hash Buffer Object>
    r_preimage: <Preimage Buffer Object>
    route_hints: [{
      hop_hints: [{
        chan_id: <Numeric Channel Id String>
        cltv_expiry_delta: <CLTV Delta Number>
        fee_base_msat: <Base Fee Number>
        fee_proportional_millionths: <Fee Parts Millitokens Per Million Number>
        node_id: <Node Public Key Hex String>
      }]
    }]
    settle_date: <Confirmation Date Epoch Seconds String>
    settle_index: <Invoice Settled Index String>
    settled: <Invoice Is Confirmed Bool>
    state: <Invoice Status String>
    value: <Tokens Value String>
    value_msat: <Milliltokens Value String>
  }
*/
module.exports = args => {
  if (!!args.is_canceled && !!args.is_confirmed) {
    throw new Error('ExpectedInvoiceNotBothCanceledAndConfirmed');
  }

  // The invoice is paid to the preimage hash, and signed by the default node
  const id = sha256(preimage);
  const paymentAddress = sha256(Buffer.concat([preimage, addressTag]));
  const publicKey = Buffer.from(pointFromScalar(signingKey, true));

  const descriptionHash = hexAsBuf(args.description_hash);
  const payments = args.payments || [];

  const state = (() => {
    if (!!args.is_confirmed) {
      return settledState;
    }

    if (!!args.is_canceled) {
      return canceledState;
    }

    // An invoice with payments that are not settled is held
    return !payments.length ? openState : acceptedState;
  })();

  // Payments are accepted, and then settled or canceled with the invoice
  const isFinal = [canceledState, settledState].includes(state);

  const htlcState = isFinal ? state : acceptedState;

  // Accepted and settled payments are paid to the invoice
  const isPaid = [acceptedState, settledState].includes(state);

  // Payments share the amount, with the remainder in the first payment
  const count = BigInt(payments.length || 1);

  const share = BigInt(mtokens) / count;

  const remainder = BigInt(mtokens) - share * count;

  // The payment request is a signed request to pay the invoice
  const unsigned = createUnsignedRequest({
    cltv_delta: cltvDelta,
    created_at: new Date(createdAt * msPerSecond).toISOString(),
    description: !descriptionHash ? '' : undefined,
    description_hash: !descriptionHash ? undefined : args.description_hash,
    destination: bufferAsHex(publicKey),
    expires_at: new Date(expiresAt * msPerSecond).toISOString(),
    features: featureBits.map(bit => ({bit})),
    id: bufferAsHex(id),
    mtokens,
    network,
    payment: bufferAsHex(paymentAddress),
  });

  const signature = sign(Buffer.from(unsigned.hash, 'hex'), signingKey);

  const {request} = createSignedRequest({
    destination: bufferAsHex(publicKey),
    hrp: unsigned.hrp,
    signature: bufferAsHex(signature),
    tags: unsigned.tags,
  });

  return {
    add_index: '1',
    amt_paid_msat: isPaid ? mtokens : '0',
    amt_paid_sat: isPaid ? tokens : '0',
    cltv_expiry: String(cltvDelta),
    creation_date: String(createdAt),
    description_hash: descriptionHash || defaultDescHash,
    expiry: String(expiresAt - createdAt),
    fallback_addr: '',
    features: makeFeatures({bits: featureBits}).features,
    htlcs: payments.map((payment, i) => {
      return {
        accept_height: 1,
        accept_time: '1',
        amt_msat: (!i ? share + remainder : share).toString(),
        chan_id: '1',
        custom_records: (payment.messages || []).reduce((sum, message) => {
          sum[typeAsKey({type: message.type}).key] = hexAsBuf(message.value);

          return sum;
        },
        {}),
        expiry_height: 1,
        htlc_index: String(i + 1),
        mpp_total_amt_msat: mtokens,
        resolve_time: htlcState === acceptedState ? '0' : '1',
        state: htlcState,
      };
    }),
    is_keysend: !!args.is_push,
    memo: '',
    payment_addr: paymentAddress,
    payment_request: request,
    private: false,
    r_hash: id,
    r_preimage: preimage,
    route_hints: [],
    settle_date: state === settledState ? String(createdAt) : '0',
    settle_index: state === settledState ? '1' : '0',
    settled: state === settledState,
    state,
    value: tokens,
    value_msat: mtokens,
  };
};
