const notFound = -1;

/** Encode an integer of a signature for DER, without padding and positive

  {
    bytes: <Big-Endian Integer Buffer Object>
  }

  @returns
  {
    encoded: <DER Integer Buffer Object>
  }
*/
module.exports = ({bytes}) => {
  const index = bytes.findIndex(n => n !== 0);

  const start = index === notFound ? bytes.length - 1 : index;

  const trimmed = bytes.subarray(start);

  // A value with the high bit set is padded to be read as positive
  const isHighBitSet = !!(trimmed[0] & 0x80);

  const value = Buffer.concat([Buffer.alloc(isHighBitSet ? 1 : 0), trimmed]);

  return {encoded: Buffer.concat([Buffer.from([0x02, value.length]), value])};
};
