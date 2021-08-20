const psbt = '70736274ff01009a020000000258e87a21b56daf0c23be8e7070456c336f7cbaa5c8757924f545887bb2abdd750000000000ffffffff838d0427d0ec650a68aa46bb0b098aea4422c071b2ca78352a077959d07cea1d0100000000ffffffff0270aaf00800000000160014d85c2b71d0060b09c9886aeb815e50991dda124d00e1f5050000000016001400aea9a2e5f0f876a588df5546e8742d1d87008f000000000000000000';

/** Make a response for fundPsbt

  {}

  @returns
  <FundPsbt Response Object>
*/
module.exports = ({}) => {
  return {
    change_output_index: 0,
    funded_psbt: Buffer.from(psbt, 'hex'),
    locked_utxos: [{
      expiration: 1,
      id: Buffer.alloc(32),
      outpoint: {
        output_index: 0,
        txid_bytes: Buffer.from('75ddabb27b8845f5247975c8a5ba7c6f336c4570708ebe230caf6db5217ae858', 'hex').reverse(),
      },
    }],
  };
};
