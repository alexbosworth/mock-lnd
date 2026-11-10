const derInteger = require('./der_integer');

/** Encode a compact signature as DER

  {
    signature: <Compact Signature Buffer Object>
  }

  @returns
  {
    encoded: <DER Signature Buffer Object>
  }
*/
module.exports = ({signature}) => {
  const r = derInteger({bytes: Buffer.from(signature.subarray(0, 32))});
  const s = derInteger({bytes: Buffer.from(signature.subarray(32))});

  const body = Buffer.concat([r.encoded, s.encoded]);

  return {encoded: Buffer.concat([Buffer.from([0x30, body.length]), body])};
};
