const {isArray} = Array;
const isBit = n => Number.isInteger(n) && n >= 0;

/** Determine if feature bits are a list of feature bit numbers, when present

  {
    [bits]: [<Feature Bit Number>]
  }

  @returns
  <Feature Bits Are Valid Bool>
*/
module.exports = ({bits}) => {
  // Exit early when there are no feature bits
  if (bits === undefined) {
    return true;
  }

  return isArray(bits) && bits.every(isBit);
};
