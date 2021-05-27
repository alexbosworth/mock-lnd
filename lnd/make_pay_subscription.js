const EventEmitter = require('events');

const makePaymentData = require('./../data/make_payment_data');

const {nextTick} = process;

/** Make a payment subscription

  {
    [payment]: <Payment Data Object>
  }

  @returns
  <EventEmitter Object>
*/
module.exports = ({payment}) => {
  const data = makePaymentData({});
  const emitter = new EventEmitter();

  nextTick(() => emitter.emit('data', payment || data));

  return emitter;
};
