const messageProblems = require('./message_problems');
const rpcDetails = require('./rpc_details');

/** Get the problems with a response to an LND RPC call

  {
    method: <RPC Method Name String>
    response: <Response Message Object>
    type: <Sub-Server Type String>
  }

  @returns
  {
    problems: [<Problem Description String>]
  }
*/
module.exports = ({method, response, type}) => {
  const {rpc} = rpcDetails({method, type});

  // Exit early when there is no such RPC in LND
  if (!rpc) {
    return {problems: [`${type}.${method}: not an LND RPC`]};
  }

  return messageProblems({
    at: `${type}.${method}`,
    message: response,
    type: rpc.response,
  });
};
