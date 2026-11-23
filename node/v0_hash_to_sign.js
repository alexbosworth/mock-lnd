const {createHash} = require('node:crypto');

const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {numberAsCompactInt} = require('@alexbosworth/blockchain');

const anyoneCanPayFlag = 0x80;
const {concat} = Buffer;
const {floor} = Math;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const idAsHash = id => Buffer.from(id, 'hex').reverse();
const outputTypeMask = 0x1f;
const sha256 = n => createHash('sha256').update(n).digest();
const sigHashNone = 2;
const sigHashSingle = 3;
const uint32 = n => Buffer.from([n, n >>> 8, n >>> 16, n >>> 24]);
const uint32Range = 2 ** 32;
const zeroHash = Buffer.alloc(32);

/** Calculate the BIP 143 hash to sign for a v0 witness input, as LND does

  {
    script: <Script Code Hex String>
    sighash: <Signature Hash Type Number>
    tokens: <Spending Output Tokens Number>
    transaction: <Raw Transaction Hex String>
    vin: <Signing Input Index Number>
  }

  @throws
  <Error>

  @returns
  {
    hash: <Hash to Sign Buffer Object>
  }
*/
module.exports = ({script, sighash, tokens, transaction, vin}) => {
  const tx = componentsOfTransaction({transaction});

  const input = tx.inputs[vin];

  // Exit early when the input is not an input of the transaction
  if (!input) {
    throw new Error(`idx ${vin} but ${tx.inputs.length} txins`);
  }

  const outputType = sighash & outputTypeMask;

  const isAnyoneCanPay = !!(sighash & anyoneCanPayFlag);
  const isNone = outputType === sigHashNone;
  const isSingle = outputType === sigHashSingle;

  // A value is its low 32 bits and then its high 32 bits, little endian
  const uint64 = n => {
    return concat([uint32(n % uint32Range), uint32(floor(n / uint32Range))]);
  };

  // An outpoint is the hash of the spent transaction and its output index
  const outpoint = n => concat([idAsHash(n.id), uint32(n.vout)]);

  // An output is its value and its script with the size of the script
  const output = n => {
    const outputScript = hexAsBuffer(n.script);

    return concat([
      uint64(n.tokens),
      numberAsCompactInt({number: outputScript.length}).encoded,
      outputScript,
    ]);
  };

  const scriptCode = hexAsBuffer(script);

  // Outpoints are committed to unless anyone can pay
  const prevouts = (() => {
    // Exit early when anyone can add inputs
    if (isAnyoneCanPay) {
      return zeroHash;
    }

    return sha256(sha256(concat(tx.inputs.map(outpoint))));
  })();

  // Sequences are committed to when signing for all inputs and outputs
  const sequences = (() => {
    // Exit early when inputs or outputs are not all signed for
    if (isAnyoneCanPay || isNone || isSingle) {
      return zeroHash;
    }

    return sha256(sha256(concat(tx.inputs.map(n => uint32(n.sequence)))));
  })();

  // Outputs are committed to, all or just the one at the input index
  const outputs = (() => {
    // Exit early when signing for the output at the index of the input
    if (isSingle) {
      const single = tx.outputs[vin];

      return !single ? zeroHash : sha256(sha256(output(single)));
    }

    // Exit early when signing for no outputs
    if (isNone) {
      return zeroHash;
    }

    return sha256(sha256(concat(tx.outputs.map(output))));
  })();

  const preimage = concat([
    uint32(tx.version),
    prevouts,
    sequences,
    outpoint(input),
    numberAsCompactInt({number: scriptCode.length}).encoded,
    scriptCode,
    uint64(tokens),
    uint32(input.sequence),
    outputs,
    uint32(tx.locktime),
    uint32(sighash), // LND commits to any sighash type, even an invalid one
  ]);

  return {hash: sha256(sha256(preimage))};
};
