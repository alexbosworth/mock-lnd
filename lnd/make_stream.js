const EventEmitter = require('node:events');

/** Make a stream of responses, like a gRPC client server-streaming call

  A stream that is canceled is marked as canceled

  {}

  @returns
  <Stream EventEmitter Object>
*/
module.exports = ({}) => {
  const stream = new EventEmitter();

  stream.cancel = () => stream.is_canceled = true;

  return stream;
};
