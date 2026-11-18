const {createHash} = require('node:crypto');

const {idForTransaction} = require('@alexbosworth/blockchain');
const {numberAsCompactInt} = require('@alexbosworth/blockchain');
const {transactionFromComponents} = require('@alexbosworth/blockchain');

const {firstBlockTime} = require('./constants');
const {secondsPerBlock} = require('./constants');

const anyoneCanSpend = '51';
const blockBits = 0x207fffff;
const blockVersion = 0x20000000;
const coinbaseOutpointId = Buffer.alloc(32).toString('hex');
const coinbaseSequence = 0xffffffff;
const coinbaseVout = 0xffffffff;
const {floor} = Math;
const halvingBlocks = 210000;
const headerByteLength = 80;
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const initialSubsidy = 50e8;
const reversed = buffer => Buffer.from(buffer).reverse();
const sha256 = n => createHash('sha256').update(n).digest();
const signBit = 0x80;

/** Make a block of a fake chain

  {
    height: <Block Height Number>
    nonce: <Header Nonce Number>
    previous: <Previous Block Hash Buffer Object>
    transactions: [<Raw Transaction Hex String>]
  }

  @returns
  {
    block: <Raw Block Buffer Object>
    hash: <Block Hash Buffer Object>
    header: <Raw Block Header Buffer Object>
    height: <Block Height Number>
    id: <Block Id Hex String>
    transactions: [<Raw Transaction Hex String>]
  }
*/
module.exports = ({height, nonce, previous, transactions}) => {
  const heightHex = height.toString(16);

  const evenHex = heightHex.length % 2 ? `0${heightHex}` : heightHex;

  // The height is a little-endian number with a sign bit, like script numbers
  const number = !height ? Buffer.alloc(0) : hexAsBuffer(evenHex).reverse();

  const isSigned = !!number.length && number[number.length - 1] >= signBit;

  const sign = isSigned ? Buffer.alloc(1) : Buffer.alloc(0);

  const heightBytes = Buffer.concat([number, sign]);

  // The coinbase script pushes the height, as BIP-34 has it, then nothing
  const script = Buffer.concat([
    Buffer.from([heightBytes.length]),
    heightBytes,
    Buffer.alloc(1),
  ]);

  const halvings = floor(height / halvingBlocks);

  const subsidyDivisor = 2 ** halvings;

  const coinbase = transactionFromComponents({
    inputs: [{
      id: coinbaseOutpointId,
      script: script.toString('hex'),
      sequence: coinbaseSequence,
      vout: coinbaseVout,
    }],
    locktime: 0,
    outputs: [{
      // The subsidy goes to an output that anyone can spend
      script: anyoneCanSpend,
      tokens: floor(initialSubsidy / subsidyDivisor),
    }],
    version: 1,
  });

  const all = [coinbase.transaction].concat(transactions);

  const hashes = all.map(transaction => {
    return reversed(hexAsBuffer(idForTransaction({transaction}).id));
  });

  // The merkle root is from hashing pairs of hashes until there is one hash
  const rootOf = level => {
    // Exit early when there is only the root left
    if (level.length === 1) {
      return level[0];
    }

    // An odd hash at the end of a level is paired with itself
    const paired = level.length % 2 ? level.concat(level.slice(-1)) : level;

    const next = paired.filter((hash, i) => !(i % 2)).map((hash, i) => {
      return sha256(sha256(Buffer.concat([hash, paired[i * 2 + 1]])));
    });

    return rootOf(next);
  };

  const header = Buffer.alloc(headerByteLength);

  header.writeUInt32LE(blockVersion, 0);
  previous.copy(header, 4);
  rootOf(hashes).copy(header, 36);
  // Blocks are ten minutes apart, see max_block_height.js for the limit
  header.writeUInt32LE(firstBlockTime + height * secondsPerBlock, 68);
  header.writeUInt32LE(blockBits, 72);
  header.writeUInt32LE(nonce, 76);

  const hash = sha256(sha256(header));

  const block = Buffer.concat([
    header,
    numberAsCompactInt({number: all.length}).encoded,
    ...all.map(hexAsBuffer),
  ]);

  return {
    block,
    hash,
    header,
    height,
    // Block ids are hashes in reverse byte order
    id: reversed(hash).toString('hex'),
    transactions: all,
  };
};
