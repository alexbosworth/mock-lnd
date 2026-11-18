const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const idOf = transaction => idForTransaction({transaction}).id;
const outpoint = n => `${n.id}:${n.vout}`;
const spendsOf = n => componentsOfTransaction({transaction: n}).inputs;

/** Check transactions for new blocks on a chain, as a chain backend checks
  the transactions of a block

  {
    blocks: [{
      transactions: [<Raw Transaction Hex String>]
    }]
    transactions: [<Raw Transaction Hex String>]
  }

  @returns
  {
    is_confirmed: <A Transaction Is in the Blocks Already Bool>
    is_conflicting: <Transactions Spend the Same Output Bool>
    is_repeated: <A Transaction Is Repeated Bool>
    is_spent: <A Transaction Spends an Output Spent in the Blocks Bool>
  }
*/
module.exports = ({blocks, transactions}) => {
  const confirmed = blocks.flatMap(n => n.transactions).map(idOf);
  const ids = transactions.map(idOf);

  // The outpoints spent by the transactions
  const spends = transactions.flatMap(n => spendsOf(n).map(outpoint));

  // Coinbase transactions do not spend outputs
  const spent = blocks.flatMap(block => {
    return block.transactions.slice(1).flatMap(spendsOf).map(outpoint);
  });

  return {
    is_confirmed: ids.some(id => confirmed.includes(id)),
    is_conflicting: spends.some((n, i) => spends.indexOf(n) !== i),
    is_repeated: ids.some((id, i) => ids.indexOf(id) !== i),
    is_spent: spends.some(n => spent.includes(n)),
  };
};
