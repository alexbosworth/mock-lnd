const {createHash} = require('node:crypto');

const {chanFormat} = require('bolt07');
const {createSignedRequest} = require('invoices');
const {createUnsignedRequest} = require('invoices');
const {paymentPathFromChannels} = require('bolt04');
const {sign} = require('tiny-secp256k1');

const isIntroduction = require('./is_introduction');
const {makeFeatures} = require('./../data');

const addressTag = Buffer.from('addr');
const bufferAsHex = buffer => buffer.toString('hex');
const currentSeconds = () => Math.floor(Date.now() / 1e3);
const dateFromSeconds = n => new Date(n * 1e3).toISOString();
const defaultCltvDelta = 80;
const defaultExpirySeconds = 60 * 60 * 24;
const featureBits = [8, 14, 17, 25];
const hasBytes = n => !!n && !!n.length;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const maxBlindedPaths = 3;
const mtokensPerToken = BigInt(1e3);
const noPathsError = 'could not find any routes to self to use for blinded route construction';
const requestNetwork = n => ({mainnet: 'bitcoin', testnet4: 'testnet'})[n] || n;
const sha256 = n => createHash('sha256').update(n).digest();

/** Make an invoice, as LND makes an invoice for an AddInvoice request

  Preimages are derived from the node secret and the add index when they are
  not given. Blinded invoices have paths in through the channels of the node,
  from peers that can start a blinded path.

  {
    add_index: <Invoice Add Index Number>
    channels: [<RPC Channel Object>]
    graph: {
      channels: [{
        id: <Standard Format Channel Id String>
        policies: [{
          public_key: <Node Public Key Hex String>
        }]
      }]
      nodes: [{
        [features]: [<Feature Bit Number>]
        public_key: <Node Public Key Hex String>
      }]
    }
    identity: <Node Identity Public Key Hex String>
    network: <Network Name String>
    private_key: <Node Identity Private Key Buffer Object>
    request: <AddInvoice Request Object>
    secret: <Node Secret Buffer Object>
  }

  @throws
  <Error>

  @returns
  {
    invoice: <RPC Invoice Object>
  }
*/
module.exports = args => {
  const {request} = args;

  const createdAt = currentSeconds();
  const cltvDelta = Number(request.cltv_expiry) || defaultCltvDelta;
  const descriptionHash = Buffer.from(request.description_hash || []);
  const expiry = Number(request.expiry) || defaultExpirySeconds;
  const hasDescriptionHash = hasBytes(request.description_hash);
  const hasPreimage = hasBytes(request.r_preimage);
  const index = Buffer.from(`invoice:${args.add_index}`);
  const msat = BigInt(request.value_msat || 0);

  const derivedPreimage = sha256(Buffer.concat([args.secret, index]));
  const mtokens = msat || BigInt(request.value || 0) * mtokensPerToken;

  const preimage = hasPreimage ? request.r_preimage : derivedPreimage;

  const id = sha256(preimage);
  const paymentAddress = sha256(Buffer.concat([preimage, addressTag]));

  // Blinded invoices are paid over blinded paths through channel peers
  const paths = (() => {
    // Exit early when the invoice is not blinded
    if (!request.is_blinded) {
      return undefined;
    }

    return args.channels
      .filter(channel => !!channel.active)
      .filter(channel => isIntroduction({
        channels: args.channels,
        graph: args.graph,
        peer: channel.remote_pubkey,
      })
      .is_introduction)
      .slice(Number(), maxBlindedPaths)
      .map(channel => {
        const scid = chanFormat({number: channel.chan_id}).channel;

        return paymentPathFromChannels({
          channels: [{
            id: scid,
            policies: [channel.remote_pubkey, args.identity].map(key => ({
              base_fee_mtokens: '1000',
              cltv_delta: 40,
              fee_rate: 1,
              max_htlc_mtokens: '100000000',
              min_htlc_mtokens: '1000',
              public_key: key,
            })),
          }],
          cltv_delta: cltvDelta,
          current_block_height: 1,
          destination: args.identity,
          id: bufferAsHex(paymentAddress),
          max_mtokens: '100000000',
        });
      });
  })();

  if (!!paths && !paths.length) {
    throw new Error(noPathsError);
  }

  const unsigned = createUnsignedRequest({
    paths,
    cltv_delta: cltvDelta,
    created_at: dateFromSeconds(createdAt),
    description: hasDescriptionHash ? undefined : (request.memo || ''),
    description_hash: bufferAsHex(descriptionHash) || undefined,
    destination: !!paths ? undefined : args.identity,
    expires_at: dateFromSeconds(createdAt + expiry),
    features: featureBits.map(bit => ({bit})),
    id: bufferAsHex(id),
    mtokens: mtokens.toString(),
    network: requestNetwork(args.network),
    payment: !!paths ? undefined : bufferAsHex(paymentAddress),
  });

  const signed = sign(hexAsBuffer(unsigned.hash), args.private_key);

  // Requests with blinded paths are not signed
  const signature = !!paths ? undefined : bufferAsHex(Buffer.from(signed));

  const {request: paymentRequest} = createSignedRequest({
    signature,
    destination: !!paths ? undefined : args.identity,
    hrp: unsigned.hrp,
    tags: unsigned.tags,
  });

  return {
    invoice: {
      add_index: String(args.add_index),
      amp_invoice_state: {},
      amt_paid: '0',
      amt_paid_msat: '0',
      amt_paid_sat: '0',
      cltv_expiry: String(cltvDelta),
      creation_date: String(createdAt),
      description_hash: descriptionHash,
      expiry: String(expiry),
      fallback_addr: request.fallback_addr || '',
      features: makeFeatures({bits: featureBits}).features,
      htlcs: [],
      is_amp: false,
      is_blinded: !!request.is_blinded,
      is_keysend: false,
      memo: request.memo || '',
      payment_addr: paymentAddress,
      payment_request: paymentRequest,
      private: !!request.private,
      r_hash: id,
      r_preimage: Buffer.from(preimage),
      route_hints: [],
      settle_date: '0',
      settle_index: '0',
      settled: false,
      state: 'OPEN',
      value: (mtokens / mtokensPerToken).toString(),
      value_msat: mtokens.toString(),
    },
  };
};
