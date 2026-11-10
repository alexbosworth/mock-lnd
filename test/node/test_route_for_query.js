const {deepStrictEqual} = require('node:assert/strict');
const {test} = require('node:test');

const method = require('./../../node/route_for_query');

const a = Buffer.alloc(33, 2).toString('hex');
const b = Buffer.alloc(33, 3).toString('hex');
const destination = Buffer.alloc(33, 4).toString('hex');
const hexAsBuffer = hex => Buffer.from(hex, 'hex');
const source = Buffer.alloc(33, 5).toString('hex');

// Find a route among routes through a and b, and get the keys of its hops
const routeKeys = args => {
  const routes = [
    {hops: [{public_key: a}, {public_key: destination}]},
    {hops: [{public_key: b}, {public_key: destination}]},
    {hops: [{public_key: a}]},
  ];

  const {route} = method({...args, routes, source});

  return !route ? undefined : route.hops.map(n => n.public_key);
};

const tests = [
  {
    args: {pub_key: destination},
    description: 'The first route to the destination is found',
    expected: [a, destination],
  },
  {
    args: {pub_key: a},
    description: 'A route ends at the destination',
    expected: [a],
  },
  {
    args: {ignored_nodes: [hexAsBuffer(a)], pub_key: destination},
    description: 'A route avoids ignored nodes',
    expected: [b, destination],
  },
  {
    args: {
      ignored_pairs: [{from: hexAsBuffer(source), to: hexAsBuffer(a)}],
      pub_key: destination,
    },
    description: 'A route avoids ignored pairs from the source',
    expected: [b, destination],
  },
  {
    args: {
      ignored_pairs: [{from: hexAsBuffer(b), to: hexAsBuffer(destination)}],
      pub_key: destination,
    },
    description: 'A route avoids ignored pairs between hops',
    expected: [a, destination],
  },
  {
    args: {
      ignored_nodes: [hexAsBuffer(a), hexAsBuffer(b)],
      pub_key: destination,
    },
    description: 'There is no route when every route is ignored',
    expected: undefined,
  },
];

tests.forEach(({args, description, expected}) => {
  test(description, () => {
    deepStrictEqual(routeKeys(args), expected, 'Got expected result');
  });
});
