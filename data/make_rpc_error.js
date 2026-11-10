const codeNames = {2: 'UNKNOWN', 5: 'NOT_FOUND', 12: 'UNIMPLEMENTED', 14: 'UNAVAILABLE'};
const unknownCode = 2;

/** Make an error as the gRPC client gives an error from LND

  {
    [code]: <gRPC Status Code Number>
    details: <Error Details String>
  }

  @returns
  <gRPC Error Object>
*/
module.exports = ({code, details}) => {
  const errorCode = code || unknownCode;

  const codeName = codeNames[errorCode] || String();

  const err = new Error(`${errorCode} ${codeName}: ${details}`);

  err.code = errorCode;
  err.details = details;
  err.metadata = {};

  return err;
};
