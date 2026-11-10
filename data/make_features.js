/** Make an RPC map of features for feature bits

  {
    bits: [<Feature Bit Number>]
  }

  @returns
  {
    features: {
      <Feature Bit Number String>: {
        is_known: <Feature Is Known Bool>
        is_required: <Feature Is Required Bool>
        name: <Feature Name String>
      }
    }
  }
*/
module.exports = ({bits}) => {
  const features = bits.reduce((sum, bit) => {
    sum[String(bit)] = {is_known: true, is_required: !(bit % 2), name: ''};

    return sum;
  },
  {});

  return {features};
};
