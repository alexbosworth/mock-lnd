const {makePaymentData} = require('./../data');
const makeStream = require('./make_stream');

const {nextTick} = process;

/** Make a payment subscription

  {
    [payment]: <Payment Data Object>
  }

  @returns
  <Stream EventEmitter Object>
*/
module.exports = ({payment}) => {
  const data = makePaymentData({});
  const stream = makeStream({});

  nextTick(() => stream.emit('data', payment || data));

  return stream;
};
