const {isPrivate} = require('tiny-secp256k1');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const isHex = n => typeof n === 'string' && /^([0-9A-F]{2})*$/i.test(n);

/** Determine if a secret is a hex encoded private key

  {
    secret: <Secret Hex String>
  }

  @returns
  <Secret Is a Private Key Bool>
*/
module.exports = ({secret}) => isHex(secret) && isPrivate(hexAsBuffer(secret));
