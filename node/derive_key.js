const {createHash} = require('node:crypto');

const {pointFromScalar} = require('tiny-secp256k1');

const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const identityFamily = 6;
const identityIndex = 0;
const sha256 = n => createHash('sha256').update(n).digest();
const uint32 = n => Buffer.from(n.toString(16).padStart(8, '0'), 'hex');

/** Derive the key at a key locator of the fake node

  The node identity key is the node secret, at family 6 and index 0. Keys at
  other locators are derived from the node secret, unless they are given.

  {
    family: <Key Family Number>
    index: <Key Index Number>
    keys: [{
      family: <Key Family Number>
      index: <Key Index Number>
      secret: <Private Key Hex String>
    }]
    secret: <Node Secret Private Key Buffer Object>
  }

  @returns
  {
    private_key: <Private Key Buffer Object>
    public_key: <Compressed Public Key Buffer Object>
  }
*/
module.exports = ({family, index, keys, secret}) => {
  const given = keys.find(key => {
    return key.family === family && key.index === index;
  });

  const isIdentity = family === identityFamily && index === identityIndex;

  const derived = () => {
    // The identity key is the node secret
    if (isIdentity) {
      return secret;
    }

    return sha256(Buffer.concat([secret, uint32(family), uint32(index)]));
  };

  const privateKey = !!given ? hexAsBuffer(given.secret) : derived();

  return {
    private_key: privateKey,
    public_key: Buffer.from(pointFromScalar(privateKey, true)),
  };
};
