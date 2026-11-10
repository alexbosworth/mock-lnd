const checkedStream = Symbol('checked stream');

/** Wrap a method of the fake LND to record calls to it, and in strict mode to
  check that its responses match the LND protos

  {
    calls: [{
      args: <RPC Arguments Object>
      [err]: <RPC Error Object>
      method: <RPC Method Name String>
      [response]: <RPC Response Object>
      [subscription]: <Stream EventEmitter Object>
      type: <Sub-Server Type String>
    }]
    fn: <RPC Method Function>
    is_strict: <Check Responses Match LND Protos Bool>
    method: <RPC Method Name String>
    streams: [{
      args: <RPC Arguments Object>
      method: <RPC Method Name String>
      subscription: <Stream EventEmitter Object>
      type: <Sub-Server Type String>
    }]
    type: <Sub-Server Type String>
  }

  @returns
  <RPC Method Function>
*/
module.exports = args => {
  // Check a response, throwing when it does not match the protos
  const check = response => {
    // The protos are only loaded when checking responses
    const {rpcResponseProblems} = require('./../protos');

    const {problems} = rpcResponseProblems({
      response,
      method: args.method,
      type: args.type,
    });

    if (!!problems.length) {
      throw new Error(`UnexpectedLndResponse ${problems.join(', ')}`);
    }
  };

  return (request, cbk) => {
    const call = {args: request, method: args.method, type: args.type};

    args.calls.push(call);

    // Exit early when the method returns a stream of responses
    if (!cbk) {
      const subscription = args.fn(request);

      call.subscription = subscription;

      // Streams are kept apart from the calls, which can be changed by tests
      args.streams.push({
        subscription,
        args: request,
        method: args.method,
        type: args.type,
      });

      // Exit early when the stream data is not checked
      if (!args.is_strict || !subscription || !!subscription[checkedStream]) {
        return subscription;
      }

      const {emit} = subscription;

      subscription[checkedStream] = true;

      // Data on the stream is checked as it is emitted
      subscription.emit = (eventName, ...data) => {
        if (eventName === 'data') {
          check(data[0]);
        }

        return emit.call(subscription, eventName, ...data);
      };

      return subscription;
    }

    return args.fn(request, (err, response) => {
      call.err = err || undefined;
      call.response = response;

      if (!err && !!args.is_strict) {
        check(response);
      }

      return cbk(err, response);
    });
  };
};
