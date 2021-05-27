const EventEmitter = require('events');

const makeInvoice = require('./../data/make_invoice');

const {nextTick} = process;

/** Make an invoice subscription

  {
    invoice: <Invoice Data Object>
  }

  @returns
  <EventEmitter Object>
*/
module.exports = ({invoice}) => {
  const data = makeInvoice({});
  const emitter = new EventEmitter();

  emitter.cancel = () => {};

  nextTick(() => {
    setTimeout(() => {
      return emitter.emit('data', invoice || data)
    },
    10);
  });

  return emitter;
};
