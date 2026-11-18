const {componentsOfTransaction} = require('@alexbosworth/blockchain');

const isHex = n => typeof n === 'string' && /^([0-9A-F]{2})+$/i.test(n);

/** Determine if a value is a raw transaction

  {
    transaction: <Raw Transaction Hex String>
  }

  @returns
  <Value Is a Raw Transaction Bool>
*/
module.exports = ({transaction}) => {
  // Exit early when the transaction is not hex
  if (!isHex(transaction)) {
    return false;
  }

  try {
    componentsOfTransaction({transaction});

    return true;
  } catch (err) {
    return false;
  }
};
