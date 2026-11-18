const defaultFeeRate = 1;
const feePerKiloWeightFloor = 253;
const {max} = Math;
const {round} = Math;
const weightUnitsPerKiloWeight = 1e3;
const weightUnitsPerVirtualByte = 4;

/** Make get chain fee response

  LND never gives a fee rate below its floor of 253 tokens per kiloweight

  {
    [tokens_per_vbyte]: <Chain Fee Tokens Per Virtual Byte Number>
  }

  @returns
  <Chain Fee Estimate Response Object>
*/
module.exports = args => {
  const rate = args.tokens_per_vbyte || defaultFeeRate;

  const satPerKvb = rate * weightUnitsPerKiloWeight;

  const satPerKw = satPerKvb / weightUnitsPerVirtualByte;

  // Fee rates below the floor are raised to the floor
  const feeRate = max(round(satPerKw), feePerKiloWeightFloor);

  return {sat_per_kw: String(feeRate)};
};
