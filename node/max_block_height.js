const {firstBlockTime} = require('./constants');
const {maxHeaderTime} = require('./constants');
const {secondsPerBlock} = require('./constants');

const {floor} = Math;

/** The highest height of a block of a fake chain

  A block header has its time as a 32-bit timestamp. Fake blocks have the time
  of the first Bitcoin block plus ten minutes for each block of height, so the
  highest height is the count of ten minute spaces between the first block
  time and the largest 32-bit timestamp: 5,106,601.

  <Max Block Height Number>
*/
module.exports = floor((maxHeaderTime - firstBlockTime) / secondsPerBlock);
