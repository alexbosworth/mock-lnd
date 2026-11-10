const lndProtos = require('./lnd_protos');

const lowerFirst = n => n.slice(0, 1).toLowerCase() + n.slice(1);

/** Get the details of an LND RPC method

  {
    method: <RPC Method Name String>
    type: <Sub-Server Type String>
  }

  @returns
  {
    [rpc]: {
      is_streaming: <Responses Are a Stream Bool>
      request: <Request Protobuf Type Object>
      response: <Response Protobuf Type Object>
    }
  }
*/
module.exports = ({method, type}) => {
  const service = lndProtos({}).services[type];

  // Exit early when there is no such sub-server
  if (!service) {
    return {};
  }

  const rpc = service.methodsArray.find(n => lowerFirst(n.name) === method);

  // Exit early when there is no such method on the sub-server
  if (!rpc) {
    return {};
  }

  return {
    rpc: {
      is_streaming: !!rpc.responseStream,
      request: rpc.resolvedRequestType,
      response: rpc.resolvedResponseType,
    },
  };
};
