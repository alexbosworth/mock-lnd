const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const bufferAsHex = buffer => Buffer.from(buffer || []).toString('hex');
const isZero = buffer => !Buffer.from(buffer || []).some(byte => !!byte);
const reversedHex = buffer => Buffer.from(buffer).reverse().toString('hex');

/** Find the confirmation of a transaction or of an output script in blocks

  {
    blocks: [{
      height: <Block Height Number>
      transactions: [<Raw Transaction Hex String>]
    }]
    request: {
      height_hint: <Earliest Confirmation Height Number>
      script: <Output Script Buffer Object>
      [txid]: <Transaction Hash Buffer Object>
    }
  }

  @returns
  {
    [block]: <Block Object>
    [index]: <Transaction Index in Block Number>
    [transaction]: <Raw Transaction Hex String>
  }
*/
module.exports = ({blocks, request}) => {
  const script = bufferAsHex(request.script);

  // LND takes transaction hashes, which are ids in reverse byte order
  const id = isZero(request.txid) ? undefined : reversedHex(request.txid);

  // A transaction matches when it pays to the script, and has the id
  const isMatch = transaction => {
    const {outputs} = componentsOfTransaction({transaction});

    // Exit early when the transaction does not pay to the script
    if (!outputs.some(output => output.script === script)) {
      return false;
    }

    return !id || idForTransaction({transaction}).id === id;
  };

  const later = blocks.filter(n => n.height >= request.height_hint);

  const block = later.find(n => n.transactions.some(isMatch));

  // Exit early when there is no confirmation
  if (!block) {
    return {};
  }

  const index = block.transactions.findIndex(isMatch);

  return {block, index, transaction: block.transactions[index]};
};
