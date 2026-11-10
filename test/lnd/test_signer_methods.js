const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {makeLnd} = require('./../../');

const empty = Buffer.alloc(0);
const ephemeral = Buffer.alloc(33, 2);
const identity = {key_family: 6, key_index: 0};

// Call a method of a sub-server of a fake LND and get its error details
const errorOf = args => {
  const lnd = makeLnd({});

  return new Promise(resolve => {
    return lnd[args.type][args.method](args.request, err => {
      return resolve(!err ? null : err.details);
    });
  });
};

// Derive a shared key with a fake LND
const sharedKeyOf = ({lnd, request}) => new Promise((resolve, reject) => {
  return lnd.signer.deriveSharedKey(request, (err, res) => {
    return !!err ? reject(err) : resolve(res.shared_key);
  });
});

// Derive shared keys with the identity key descriptor and without a key, and
// check that the key that is used by default is the identity key
const isIdentityDefault = async ({}) => {
  const lnd = makeLnd({});

  const byDefault = await sharedKeyOf({
    lnd,
    request: {ephemeral_pubkey: ephemeral},
  });

  const byDescriptor = await sharedKeyOf({
    lnd,
    request: {ephemeral_pubkey: ephemeral, key_desc: {key_loc: identity}},
  });

  return byDefault.equals(byDescriptor);
};

const tests = [
  {
    args: {
      method: 'deriveSharedKey',
      request: {
        ephemeral_pubkey: ephemeral,
        key_desc: {key_loc: identity},
        key_loc: identity,
      },
      type: 'signer',
    },
    description: 'A shared key is derived with a descriptor or a locator',
    expected: 'use either key_desc or key_loc',
    method: errorOf,
  },
  {
    args: {
      method: 'deriveSharedKey',
      request: {ephemeral_pubkey: Buffer.alloc(3)},
      type: 'signer',
    },
    description: 'A shared key is derived with a public key',
    expected: 'unable to parse ephemeral pubkey',
    method: errorOf,
  },
  {
    args: {
      method: 'signMessage',
      request: {msg: Buffer.alloc(1)},
      type: 'signer',
    },
    description: 'Signing is with a key at a locator',
    expected: 'a key locator MUST be passed in',
    method: errorOf,
  },
  {
    args: {method: 'signMessage', request: {}, type: 'signer'},
    description: 'The message is checked before the key locator, like LND',
    expected: 'a message to sign MUST be passed in',
    method: errorOf,
  },
  {
    args: {
      method: 'signMessage',
      request: {
        compact_sig: true,
        key_loc: identity,
        msg: Buffer.alloc(1),
        schnorr_sig: true,
      },
      type: 'signer',
    },
    description: 'Schnorr signatures are not compact',
    expected: 'compact format can not be used for Schnorr signatures',
    method: errorOf,
  },
  {
    args: {
      method: 'signMessage',
      request: {key_loc: identity, msg: empty},
      type: 'signer',
    },
    description: 'Signing is of a message',
    expected: 'a message to sign MUST be passed in',
    method: errorOf,
  },
  {
    args: {},
    description: 'A shared key can be derived with a key descriptor',
    expected: true,
    method: isIdentityDefault,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, async () => {
    deepStrictEqual(await method(args), expected, 'Got expected result');
  });
});
