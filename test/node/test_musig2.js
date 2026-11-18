const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const {verifySchnorr} = require('tiny-secp256k1');

const {musig2AggregateKeys} = require('./../../node');
const {musig2AggregateNonces} = require('./../../node');
const {musig2CombineSignatures} = require('./../../node');
const {musig2PartialSign} = require('./../../node');

const aggregatedDuplicateKey = 'b436e3bad62b8cd409969a224731c193d051162d8c5ae8b109306127da3aa935';
const aggregatedKeysPairs = '69bc22bfa5d106306e48a20679de1d7389386124d07571d0d872686028c26a3e';
const aggregatedNegatedKey = 'a886a992e178fb725fa308586018634d0936ae8cc27299675d90947ffce0b4a6';
const aggregatedNonce = '035fe1873b4f2967f52fea4a06ad5a8eccbe9d0fd73068012c894e2e87ccb5804b024725377345bde0e9c33af3c43c0a29a9249f2f2956fa8cfeb55c8573d0262dc8';
const aggregatedNonceInfinity = '035fe1873b4f2967f52fea4a06ad5a8eccbe9d0fd73068012c894e2e87ccb5804b000000000000000000000000000000000000000000000000000000000000000000';
const bufferAsHex = buffer => Buffer.from(buffer).toString('hex');
const combineKeyA = '03935f972da013f80ae011890fa89b67a27b7be6ccb24d3274d18b2d4067f261a9';
const combineKeyB = '03c7fb101d97ff930acd0c6760852ef64e69083de0b06ac6335724754bb4b0522c';
const combineMessage = '599c67ea410d005b9da90817cf03ed3b1c868e4da4edf00a5880b0082c237869';
const combineNonce = '0224afd36c902084058b51b5d36676bba4dc97c775873768e58822f87fe437d792028cb15929099eee2f5dae404cd39357591ba32e9af4e162b8d3e7cb5efe31cb20';
const combineSignature = '1069b67ec3d2f3c7c08291accb17a9c9b8f2819a52eb5df8726e17e7d6b52e9f01800260a7e9dac450f4be522de4ce12ba91aeaf2b4279219ef74be1d286add9';
const combineSignatureA = '9a87d3b79ec67228cb97878b76049b15dbd05b8158d17b5b9114d3c226887505';
const combineSignatureB = '66f82ea90923689b855d36c6b7e032fb9970301481b99e01cdb4d6ac7c347a15';
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const keyA = '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9';
const keyB = '03dff1d77f2a671c5f36183726db2341be58feae1da2deced843240f7b502ba659';
const keyNegatedA = '03f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9';
const nonceA = '020151c80f435648df67a22b749cd798ce54e0321d034b92b709b567d60a42e66603ba47fbc1834437b3212e89a84d8425e7bf12e0245d98262268ebdcb385d50641';
const nonceB = '03ff406ffd8adb9cd29877e4985014f66a59f6cd01c0e88caa8e5f3166b1f676a60248c264cdd57d3c24d79990b0f865674eb62a0f9018277a95011b41bfc193b833';
const nonceC = '020151c80f435648df67a22b749cd798ce54e0321d034b92b709b567d60a42e6660279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const nonceD = '03ff406ffd8adb9cd29877e4985014f66a59f6cd01c0e88caa8e5f3166b1f676a60379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const signedPartialSignature = '22d1b07e5d00c726b7e1362c87166935722ee66e7d8312182085d3010d71a536';
const signingKey = '03935f972da013f80ae011890fa89b67a27b7be6ccb24d3274d18b2d4067f261a9';
const signingMessage = 'f95466d086770e689964664219266fe5ed215c92ae20bab5c9d79addddf3c0cf';
const signingNonce = '0337c87821afd50a8644d820a8f3e02e499c931865c2360fb43d0a0d20dafe07ea0287bf891d2a6deaebadc909352aa9405d1428c15f4b75f04dae642a95c2548480';
const signingSecret = '7fb9e0e687ada1eebf7ecfe2f21e73ebdb51a7d450948dfe8d76d7f2d1007671';
const signingSecretNonce = '508b81a611f100a6b2b6b29656590898af488bcf2e1f55cf22e5cfb84421fe61fa27fd49b1d50085b481285e1ca205d55c82cc1b31ff5cd54a489829355901f7';
const tweak = 'b511da492182a91b0ffb9a98020d55f260ae86d7ecbd0399c7383d59a5f2af7c';
const tweakedNonce = '0208c5c438c710f4f96a61e9ff3c37758814b8c3ae12bfea0ed2c87ff6954ff186020b1816ea104b4fca2d304d733e0e19cead51303ff6420bfd222335caa402916d';
const tweakedSignature = '5c558e1dcade86da0b2f02626a512e30a22cf5255caea7ee32c38e9a71a0e9148ba6c0e6ec7683b64220f0298696f1b878cd47b107b81f7188812d593971e0cc';
const tweakedSignatureA = '4f5aee41510848a6447dcd1bbc78457ef69024944c87f40250d3ef2c25d33efe';
const tweakedSignatureB = 'ddef427bbb847cc027beff4edb01038148917832253ebc355fc33f4a8e2fcce4';

// Aggregate keys and get the x-only aggregated key
const aggregatedKey = args => {
  const {key} = musig2AggregateKeys({keys: args.keys.map(hexAsBuffer)});

  return bufferAsHex(key.subarray(1));
};

// Aggregate nonces and get the aggregated nonce
const aggregatedNonces = ({nonces}) => {
  const {nonce} = musig2AggregateNonces({nonces: nonces.map(hexAsBuffer)});

  return bufferAsHex(nonce);
};

// Make a partial signature as the single signer of a session
const partialSignature = ({}) => {
  const aggregated = musig2AggregateKeys({keys: [hexAsBuffer(signingKey)]});

  const [signer] = aggregated.coefficients;

  const {signature} = musig2PartialSign({
    gacc: aggregated.gacc,
    key: aggregated.key,
    key_coefficient: signer.coefficient,
    message: hexAsBuffer(signingMessage),
    nonce: hexAsBuffer(signingNonce),
    private_key: hexAsBuffer(signingSecret),
    secret_nonce: hexAsBuffer(signingSecretNonce),
  });

  return bufferAsHex(signature);
};

// Combine partial signatures, and get the signature and if it is valid
const combinedSignature = args => {
  const aggregated = musig2AggregateKeys({
    keys: [combineKeyA, combineKeyB].map(hexAsBuffer),
    tweaks: args.tweaks.map(n => ({...n, tweak: hexAsBuffer(n.tweak)})),
  });

  const message = hexAsBuffer(combineMessage);

  const {signature} = musig2CombineSignatures({
    message,
    key: aggregated.key,
    nonce: hexAsBuffer(args.nonce),
    signatures: args.signatures.map(hexAsBuffer),
    tacc: aggregated.tacc,
  });

  const key = aggregated.key.subarray(1);

  return {
    is_valid: verifySchnorr(message, key, signature),
    signature: bufferAsHex(signature),
  };
};

// The test vectors are BIP-327 test vectors where the keys are sorted
const tests = [
  {
    args: {keys: [keyA, keyA, keyA]},
    description: 'The same key is aggregated, as BIP-327 aggregates it',
    expected: aggregatedDuplicateKey,
    method: aggregatedKey,
  },
  {
    args: {keys: [keyB, keyB, keyA, keyA]},
    description: 'Keys are sorted before they are aggregated',
    expected: aggregatedKeysPairs,
    method: aggregatedKey,
  },
  {
    args: {keys: [keyNegatedA, keyA]},
    description: 'Keys with the same x coordinate are different keys',
    expected: aggregatedNegatedKey,
    method: aggregatedKey,
  },
  {
    args: {nonces: [nonceA, nonceB]},
    description: 'Nonces are aggregated, as BIP-327 aggregates them',
    expected: aggregatedNonce,
    method: aggregatedNonces,
  },
  {
    args: {nonces: [nonceC, nonceD]},
    description: 'A nonce point at infinity is aggregated as zeros',
    expected: aggregatedNonceInfinity,
    method: aggregatedNonces,
  },
  {
    args: {},
    description: 'A partial signature is made, as BIP-327 signs',
    expected: signedPartialSignature,
    method: partialSignature,
  },
  {
    args: {
      nonce: combineNonce,
      signatures: [combineSignatureA, combineSignatureB],
      tweaks: [],
    },
    description: 'Partial signatures are combined, as BIP-327 combines them',
    expected: {is_valid: true, signature: combineSignature},
    method: combinedSignature,
  },
  {
    args: {
      nonce: tweakedNonce,
      signatures: [tweakedSignatureA, tweakedSignatureB],
      tweaks: [{tweak, is_x_only: false}],
    },
    description: 'Partial signatures for a tweaked key are combined',
    expected: {is_valid: true, signature: tweakedSignature},
    method: combinedSignature,
  },
];

tests.forEach(({args, description, expected, method}) => {
  test(description, () => {
    deepStrictEqual(method(args), expected, 'Got expected result');
  });
});
