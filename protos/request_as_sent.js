const {dirname} = require('node:path');
const {join} = require('node:path');

const grpcOptions = require('lightning/lnd_grpc/grpc_options');
const grpcServices = require('lightning/grpc/grpc_services');

const loaded = {};
const {values} = Object;

/** Encode a request as the gRPC client of the lightning package sends it,
  and decode it as LND gets it

  {
    method: <RPC Method Name String>
    request: <Request Object>
    type: <Sub-Server Type String>
  }

  @throws
  <Error>

  @returns
  {
    request: <Request as LND Gets It Object>
  }
*/
module.exports = ({method, request, type}) => {
  const service = grpcServices.serviceTypes[type];

  // Protos are loaded with the proto loader that the lightning package uses
  if (!loaded[service]) {
    const lightningDir = dirname(require.resolve('lightning/package.json'));

    const loader = require.resolve('@grpc/proto-loader', {
      paths: [lightningDir],
    });

    const file = grpcServices.protoFiles[service];

    loaded[service] = require(loader).loadSync(
      join(lightningDir, 'grpc', 'protos', file),
      grpcOptions
    );
  }

  const servicePath = `${grpcServices.packageTypes[service]}.${service}`;

  const rpc = values(loaded[service][servicePath]).find(n => {
    return n.originalName === method;
  });

  const encoded = rpc.requestSerialize(request);

  return {request: rpc.requestDeserialize(encoded)};
};
