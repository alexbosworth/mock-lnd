const bitsOf = type => /64$/.test(type) ? 64n : 32n;
const isSigned = type => /^(int|sint|sfixed)/.test(type);

/** Determine if an integer is in the range of its proto integer type

  {
    type: <Integer Proto Type String>
    value: <Integer Number or String>
  }

  @returns
  <Integer Is In Range Bool>
*/
module.exports = ({type, value}) => {
  const bits = bitsOf(type);
  const n = BigInt(value);

  // Signed integers have a sign bit, unsigned integers are not negative
  const highest = isSigned(type) ? 2n ** (bits - 1n) - 1n : 2n ** bits - 1n;
  const lowest = isSigned(type) ? -(2n ** (bits - 1n)) : 0n;

  return n >= lowest && n <= highest;
};
