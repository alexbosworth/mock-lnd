const {basename} = require('node:path');
const {dirname} = require('node:path');
const {join} = require('node:path');

const {Root} = require('protobufjs');

const grpcServices = require('lightning/grpc/grpc_services');

const {entries} = Object;
const loaded = {};
const options = {keepCase: true};
const {values} = Object;

/** Get the LND gRPC protos, as the lightning package uses them

  {}

  @returns
  {
    root: <Protobuf Root Object>
    services: {
      <Sub-Server Type String>: <Protobuf Service Object>
    }
  }
*/
module.exports = ({}) => {
  // Exit early when the protos are already loaded
  if (!!loaded.root) {
    return loaded;
  }

  const files = values(grpcServices.protoFiles);
  const lightningDir = dirname(require.resolve('lightning/package.json'));
  const root = new Root();

  const protosDir = join(lightningDir, 'grpc', 'protos');

  // Protos import other protos that are in the same directory
  root.resolvePath = (origin, target) => join(protosDir, basename(target));

  root.loadSync(files.map(file => join(protosDir, file)), options);

  root.resolveAll();

  const types = entries(grpcServices.serviceTypes);

  loaded.services = types.reduce((sum, [type, service]) => {
    const servicePath = `${grpcServices.packageTypes[service]}.${service}`;

    sum[type] = root.lookupService(servicePath);

    return sum;
  },
  {});

  loaded.root = root;

  return loaded;
};
