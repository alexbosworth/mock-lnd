const {createSignedRequest} = require('invoices');
const {createUnsignedRequest} = require('invoices');
const sign = require('secp256k1').ecdsaSign;

const bufFromHex = hex => Buffer.from(hex, 'hex');
const destination = '03e7156ae33b0a208d0744199163177e909e80176e55d97a2f221ede0f934dd9ad';
const privateKey = 'e126f68f7eafcc8b74f54d269fe206be715000f94dac067d1c04a8ca3b2db734';

/** Make a BOLT 11 payment request

  {
    [mtokens]: <Millitokens String>
  }

  @returns
  {
    request: <BOLT 11 Payment Request String>
  }
*/
module.exports = ({mtokens}) => {
  const {hash, hrp, tags} = createUnsignedRequest({
    created_at: '2117-06-01T10:57:38.000Z',
    description_hash: '3925b6f67e2c340036ed12093dd44e0368df1b6ea26c53dbe4811f58fd5db8c1',
    id: '0001020304050607080900010203040506070809000102030405060708090102',
    mtokens: mtokens || '1000',
    network: 'bitcoin',
  });

  const {signature} = sign(bufFromHex(hash), bufFromHex(privateKey));

  const {request} = createSignedRequest({
    destination,
    hrp,
    tags,
    signature: Buffer.from(signature).toString('hex'),
  });

  return {request};
};
