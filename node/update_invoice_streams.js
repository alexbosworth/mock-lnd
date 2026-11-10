/** Update invoice streams with an invoice, unless they are canceled

  {
    invoice: <RPC Invoice Object>
    streams: [<Stream EventEmitter Object>]
  }
*/
module.exports = ({invoice, streams}) => {
  return streams
    .filter(stream => !stream.is_canceled)
    .forEach(stream => stream.emit('data', invoice));
};
