const {isArray} = Array;
const isChannelId = n => typeof n === 'string' && /^\d+x\d+x\d+$/.test(n);

/** Determine if the ids of a channel are in the standard format

  {
    [id]: <Standard Format Channel Id String>
    [other_ids]: [<Other Standard Format Channel Id String>]
  }

  @returns
  <Channel Ids Are Valid Bool>
*/
module.exports = args => {
  // Exit early when the channel id is not in the standard format
  if (args.id !== undefined && !isChannelId(args.id)) {
    return false;
  }

  // Exit early when there are no other ids
  if (args.other_ids === undefined) {
    return true;
  }

  return isArray(args.other_ids) && args.other_ids.every(isChannelId);
};
