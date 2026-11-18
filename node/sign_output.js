const {sign} = require('tiny-secp256k1');
const {signSchnorr} = require('tiny-secp256k1');
const {v0HashToSign} = require('@alexbosworth/blockchain');
const {v1HashToSign} = require('p2tr');

const derSignature = require('./der_signature');
const tapTweaked = require('./tap_tweaked');

const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isP2tr = script => /^5120[0-9a-f]{64}$/.test(script);
const isP2wpkh = script => /^0014[0-9a-f]{40}$/.test(script);
const scriptSpendMethod = 3;

/** Sign an input of a transaction, as the LND signer signs for a sign
  descriptor

  {
    method: <Sign Method Number>
    output_script: <Spending Output Script Hex String>
    output_tokens: <Spending Output Tokens Number>
    private_key: <Private Key Buffer Object>
    sighash: <Signature Hash Type Number>
    [spends]: [{
      script: <Spent Output Script Hex String>
      tokens: <Spent Output Tokens Number>
    }]
    tap_tweak: <Taproot Tweak Buffer Object>
    transaction: <Raw Transaction Hex String>
    vin: <Signing Input Index Number>
    witness_script: <Witness Script Buffer Object>
  }

  @throws
  <Error>

  @returns
  {
    signature: <Signature Buffer Object>
  }
*/
module.exports = args => {
  // Exit early when signing for a taproot output
  if (isP2tr(args.output_script)) {
    const isScriptSpend = args.method === scriptSpendMethod;

    const leaf = {script: bufferAsHex(args.witness_script)};

    const {hash} = v1HashToSign({
      leaf: isScriptSpend ? leaf : undefined,
      sighash: args.sighash,
      spends: args.spends,
      transaction: args.transaction,
      vin: args.vin,
    });

    // A key spend signs with the key tweaked with the tap tweak
    const key = (() => {
      // Exit early when signing for a script with the key itself
      if (isScriptSpend) {
        return args.private_key;
      }

      return tapTweaked({private_key: args.private_key, root: args.tap_tweak})
        .private_key;
    })();

    return {signature: Buffer.from(signSchnorr(hexAsBuffer(hash), key))};
  }

  const witnessScript = bufferAsHex(args.witness_script);

  // A P2WPKH output is signed with the P2PKH script of the public key hash
  const script = (() => {
    // Exit early when the witness script is not a P2WPKH output script
    if (!isP2wpkh(witnessScript)) {
      return witnessScript;
    }

    return `76a914${witnessScript.slice(4)}88ac`;
  })();

  const {hash} = v0HashToSign({
    script,
    sighash: args.sighash,
    tokens: args.output_tokens,
    transaction: args.transaction,
    vin: args.vin,
  });

  const signature = sign(hexAsBuffer(hash), args.private_key);

  // LND gives DER signatures without the sighash flag
  return {signature: derSignature({signature}).encoded};
};
