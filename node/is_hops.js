const {isArray} = Array;
const isChannelId = n => typeof n === 'string' && /^\d+x\d+x\d+$/.test(n);
const isKey = n => typeof n === 'string' && /^0[23][0-9A-F]{64}$/i.test(n);

/** Determine if hops are a list of public keys with optional channels

  {
    hops: [{
      [channel]: <Standard Format Channel Id String>
      public_key: <Node Public Key Hex String>
    }]
  }

  @returns
  <Hops Are Valid Bool>
*/
module.exports = ({hops}) => {
  // Exit early when there is no list of hops
  if (!isArray(hops)) {
    return false;
  }

  return hops.every(hop => {
    // Exit early when the hop is through a channel that is not standard format
    if (hop.channel !== undefined && !isChannelId(hop.channel)) {
      return false;
    }

    return isKey(hop.public_key);
  });
};
