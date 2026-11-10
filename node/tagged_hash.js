const {createHash} = require('node:crypto');

const sha256 = n => createHash('sha256').update(n).digest();

/** BIP-340 tagged hash of a message

  {
    message: <Message Buffer Object>
    tag: <Tag Buffer Object>
  }

  @returns
  {
    hash: <Tagged Hash Buffer Object>
  }
*/
module.exports = ({message, tag}) => {
  const tagHash = sha256(tag);

  return {hash: sha256(Buffer.concat([tagHash, tagHash, message]))};
};
