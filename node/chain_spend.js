const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const bufferAsHex = buffer => Buffer.from(buffer || []).toString('hex');
const isZero = buffer => !Buffer.from(buffer || []).some(byte => !!byte);
const reversedHex = buffer => Buffer.from(buffer).reverse().toString('hex');

/** Find the spend of an outpoint or of an output script in blocks

  {
    blocks: [{
      height: <Block Height Number>
      transactions: [<Raw Transaction Hex String>]
    }]
    request: {
      height_hint: <Earliest Spend Height Number>
      [outpoint]: {
        hash: <Spent Transaction Hash Buffer Object>
        index: <Spent Transaction Output Index Number>
      }
      script: <Output Script Buffer Object>
    }
  }

  @returns
  {
    [block]: <Block Object>
    [transaction]: <Raw Spending Transaction Hex String>
    [vin]: <Spending Input Index Number>
  }
*/
module.exports = ({blocks, request}) => {
  const outpoint = request.outpoint || {};
  const script = bufferAsHex(request.script);

  // The zero outpoint watches for spends of any output paying to the script
  const isScriptSpend = isZero(outpoint.hash) && !outpoint.index;

  const all = blocks.flatMap(n => n.transactions);

  // The script of an output that is in the blocks
  const outputScript = input => {
    const spent = all.find(transaction => {
      return idForTransaction({transaction}).id === input.id;
    });

    // Exit early when the spent transaction is not in the blocks
    if (!spent) {
      return undefined;
    }

    const output = componentsOfTransaction({transaction: spent})
      .outputs[input.vout];

    return !output ? undefined : output.script;
  };

  // An input matches when it spends the outpoint, or spends to the script
  const isSpend = input => {
    // Exit early when matching on the script that is spent
    if (isScriptSpend) {
      return outputScript(input) === script;
    }

    const isIndex = input.vout === (outpoint.index || Number());

    // LND takes outpoint hashes, which are ids in reverse byte order
    return isIndex && input.id === reversedHex(outpoint.hash);
  };

  const spendsOf = transaction => {
    return componentsOfTransaction({transaction}).inputs.findIndex(isSpend);
  };

  const later = blocks.filter(n => n.height >= request.height_hint);

  // Coinbase transactions do not spend outputs
  const block = later.find(n => {
    return n.transactions.slice(1).some(tx => spendsOf(tx) !== -1);
  });

  // Exit early when there is no spend
  if (!block) {
    return {};
  }

  const transaction = block.transactions.slice(1).find(tx => {
    return spendsOf(tx) !== -1;
  });

  return {block, transaction, vin: spendsOf(transaction)};
};
