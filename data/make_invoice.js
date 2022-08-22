const defaultDescHash = Buffer.alloc(0);
const hexAsBuf = hex => !!hex ? Buffer.from(hex, 'hex') : undefined;

/** Lookup invoice mock response

  {
    [description_hash]: <Description Hash Hex String>
    [is_confirmed]: <Invoice is Settled Bool>
    [is_push]: <Invoice is KeySend Bool>
    [payments]: [<Payment Object>]
  }

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
  return {
    add_index: '1',
    amt_paid_msat: '1000',
    amt_paid_sat: '1',
    cltv_expiry: '1',
    creation_date: '1',
    description_hash: hexAsBuf(args.description_hash) || defaultDescHash,
    expiry: '1',
    fallback_addr: '',
    features: {},
    htlcs: (args.payments || []).map(payment => {
      return {
        accept_height: 1,
        accept_time: '1',
        amt_msat: '1',
        chan_id: '1',
        custom_records: (payment.messages || []).reduce((sum, message) => {
          const type = Buffer.alloc(8);

          type.writeBigInt64LE(BigInt(message.type));

          const attribute = Array(...type).map(n => String.fromCharCode(n));

          sum[attribute.join('')] = hexAsBuf(message.value);

          return sum;
        },
        {}),
        expiry_height: 1,
        htlc_index: '1',
        mpp_total_amt_msat: '1',
        resolve_time: '1',
        state: 'SETTLED',
      };
    }),
    is_keysend: !!args.is_push,
    memo: '',
    payment_addr: Buffer.alloc(0),
    payment_request: 'lntb1500n1pdn4czkpp5ugdqer05qrrxuchrzkcue94th9w2xzasp9qm7d0yxcgp4uh4kn4qdpa2fjkzep6yprkcmmzv9kzqsmj09c8gmmrw4e8yetwvdujq5n9va6kcct5d9hkucqzysdlghdpua7uvjjkcfj49psxtlqzkp5pdncffdfk2cp3mp76thrl29qhqgzufm503pjj96586n5w6edgw3n66j4rxxs707y4zdjuhyt6qqe5weu4',
    private: false,
    r_hash: Buffer.alloc(32),
    r_preimage: Buffer.alloc(32),
    route_hints: [],
    settle_date: '1',
    settle_index: 1,
    settled: !!args.is_confirmed,
    state: !!args.is_confirmed ? 'SETTLED' : 'CANCELED',
    value: '1',
    value_msat: '1000',
  };
};
