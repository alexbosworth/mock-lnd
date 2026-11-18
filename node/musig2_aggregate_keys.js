const {pointAdd} = require('tiny-secp256k1');
const {pointAddScalar} = require('tiny-secp256k1');
const {pointMultiply} = require('tiny-secp256k1');

const curveOrder = require('./curve_order');
const taggedHash = require('./tagged_hash');

const bufferAsBigInt = buffer => BigInt(`0x${buffer.toString('hex')}`);
const coefficientTag = Buffer.from('KeyAgg coefficient');
const evenPrefix = 2;
const listTag = Buffer.from('KeyAgg list');
const negate = n => Buffer.concat([Buffer.from([n[0] ^ 1]), n.subarray(1)]);
const scalarBytes = n => Buffer.from(n.toString(16).padStart(64, '0'), 'hex');
const sortKeys = keys => keys.slice().sort(Buffer.compare);
const tapTweakTag = Buffer.from('TapTweak');
const xOnly = point => point.subarray(1);

/** Aggregate the public keys of MuSig2 signers, as BIP-327 KeyAgg does with
  sorted keys, and then apply tweaks to the aggregated key

  {
    [is_taproot]: <Apply Taproot Tweak Bool>
    keys: [<Compressed Public Key Buffer Object>]
    [script_root]: <Taproot Script Root Buffer Object>
    [tweaks]: [{
      is_x_only: <Tweak X-Only Key Bool>
      tweak: <Tweak Scalar Buffer Object>
    }]
  }

  @throws
  <Error>

  @returns
  {
    coefficients: [{
      coefficient: <Key Aggregation Coefficient BigInt>
      public_key: <Compressed Public Key Buffer Object>
    }]
    gacc: <Accumulated Parity Factor BigInt>
    internal_key: <Aggregated Key Before Tweaks Compressed Buffer Object>
    key: <Aggregated Key With Tweaks Compressed Buffer Object>
    tacc: <Accumulated Tweak BigInt>
  }
*/
module.exports = args => {
  const keys = sortKeys(args.keys);

  const list = taggedHash({message: Buffer.concat(keys), tag: listTag}).hash;

  // The second unique key of the sorted keys has a coefficient of one
  const second = keys.find(key => !key.equals(keys[0]));

  const coefficients = keys.map(key => {
    // Exit early when the key is the second unique key
    if (!!second && key.equals(second)) {
      return {coefficient: 1n, public_key: key};
    }

    const {hash} = taggedHash({
      message: Buffer.concat([list, key]),
      tag: coefficientTag,
    });

    return {coefficient: bufferAsBigInt(hash) % curveOrder, public_key: key};
  });

  // The aggregated key is the sum of the keys times their coefficients
  const sum = coefficients.reduce((total, signer) => {
    const coefficient = scalarBytes(signer.coefficient);

    const point = pointMultiply(signer.public_key, coefficient, true);

    return !total ? point : pointAdd(total, point, true);
  },
  null);

  if (!sum) {
    throw new Error('aggregated key is infinity point');
  }

  const aggregated = Buffer.from(sum);

  // A taproot tweak commits to the x-only aggregated key and a script root
  const root = Buffer.concat([
    xOnly(aggregated),
    args.script_root || Buffer.alloc(0),
  ]);

  const taprootTweak = {
    is_x_only: true,
    tweak: taggedHash({message: root, tag: tapTweakTag}).hash,
  };

  // LND only applies generic tweaks when there is no taproot tweak
  const tweaks = !!args.is_taproot ? [taprootTweak] : args.tweaks || [];

  // Tweaks are applied in order, keeping track of the parity and the tweak
  const tweaked = tweaks.reduce((total, tweak) => {
    const isNegated = !!tweak.is_x_only && total.key[0] !== evenPrefix;
    const value = bufferAsBigInt(tweak.tweak);

    if (value >= curveOrder) {
      throw new Error('tweaked key is too large');
    }

    const base = isNegated ? negate(total.key) : total.key;
    const parity = isNegated ? curveOrder - 1n : 1n;

    const key = pointAddScalar(base, tweak.tweak, true);

    if (!key) {
      throw new Error('tweaked key is infinity point');
    }

    return {
      gacc: (parity * total.gacc) % curveOrder,
      key: Buffer.from(key),
      tacc: (value + parity * total.tacc) % curveOrder,
    };
  },
  {gacc: 1n, key: aggregated, tacc: 0n});

  return {
    coefficients,
    gacc: tweaked.gacc,
    internal_key: aggregated,
    key: tweaked.key,
    tacc: tweaked.tacc,
  };
};
