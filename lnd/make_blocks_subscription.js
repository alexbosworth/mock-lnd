const EventEmitter = require('events');

const {nextTick} = process;

/** Make a blocks subscription, which is told of the current block

  {}

  @returns
  <EventEmitter Object>
*/
module.exports = ({}) => {
  const data = {hash: Buffer.alloc(32), height: 1};
  const emitter = new EventEmitter();

  emitter.cancel = () => {};
  nextTick(() => emitter.emit('data', data));

  return emitter;
};
