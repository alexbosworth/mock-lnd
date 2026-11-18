const {componentsOfTransaction} = require('@alexbosworth/blockchain');
const {idForTransaction} = require('@alexbosworth/blockchain');

const idOf = transaction => idForTransaction({transaction}).id;
const spendsOf = n => componentsOfTransaction({transaction: n}).inputs;

/** Find the transactions in a mempool that spend the outputs of transactions,
  or that spend the outputs of those spends, and so on

  Generations of spends are found one after another, so a chain of spends of
  any length is found.

  {
    ids: [<Transaction Id Hex String>]
    mempool: [<Raw Transaction Hex String>]
  }

  @returns
  {
    descendants: [<Raw Transaction Hex String>]
  }
*/
module.exports = ({ids, mempool}) => {
  const descendants = [];
  const parents = new Set(ids);

  const pending = mempool.map(transaction => ({
    transaction,
    id: idOf(transaction),
    spends: spendsOf(transaction).map(n => n.id),
  }));

  let children = [];

  // Each generation of spends is found from the generation before it
  do {
    children = pending.filter(n => {
      return !descendants.includes(n.transaction) && n.spends.some(id => {
        return parents.has(id);
      });
    });

    children.forEach(n => {
      descendants.push(n.transaction);

      return parents.add(n.id);
    });
  } while (!!children.length);

  return {descendants};
};
