const typeKeyBytes = 8;

/** Map key for a record type, as RPC uint64 map keys are strings of their
    eight little-endian bytes

  {
    type: <Record Type Number String>
  }

  @returns
  {
    key: <RPC Map Key String>
  }
*/
module.exports = ({type}) => {
  const bytes = Buffer.alloc(typeKeyBytes);

  bytes.writeBigUInt64LE(BigInt(type));

  return {key: bytes.toString('latin1')};
};
