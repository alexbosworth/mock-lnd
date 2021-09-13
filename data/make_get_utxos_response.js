/** Make a response for get utxos

  {}

  @returns
  <ListUnspent Response Object>
*/
module.exports = ({}) => {
  return {
    utxos: [{
      address: 'bc1zw508d6qejxtdg4y5r3zarvaryvg6kdaj',
      address_format: 'p2pkh',
      address_type: 'NESTED_PUBKEY_HASH',
      amount_sat: '1',
      confirmation_count: 1,
      confirmations: '1',
      outpoint: {
        output_index: 0,
        txid_str: Buffer.alloc(32).toString('hex'),
      },
      output_script: '5210751e76e8199196d454941c45d1b3a323',
      pk_script: '5210751e76e8199196d454941c45d1b3a323',
      tokens: 1,
      transaction_id: Buffer.alloc(32).toString('hex'),
      transaction_vout: 0,
    }],
  };
};
