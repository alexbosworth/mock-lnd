# Contributing

## Code

- Lines are at most 79 columns. A constant at the top of a module can go
    past that when it is a string or other data that does not break up.
- Constants that are not requires go in one block at the top of a module,
    sorted by name, with one line for each constant.
- Constants in a block never reference each other, not even in the body of
    an arrow function. A value that is made from another goes in a later
    block in a function body, or in a module of its own.
- Small computations like `Math.floor(Date.now() / 1e3)` go in helper
    constants at the top.
- Built-in methods like `Object.entries`, `JSON.stringify` and
    `Number.isInteger` are not called inline in function bodies. They go
    through a constant at the top, like `const {entries} = Object;`, or a
    helper at the top that calls them, like
    `const isTimeout = n => Number.isSafeInteger(n) && n > 0;`.
- A ternary is on a single line.
- Variable names are camel case. When arguments have snake case names, use
    `args` and read `args.is_strict` instead of destructuring them.
- Never name a variable `name` or `status`, or after another browser global
    like `event`, `open` or `self`.

```js
const currentSeconds = () => Math.floor(Date.now() / 1e3);
const defaultExpirySeconds = 60 * 60 * 24;
const {entries} = Object;
const {isInteger} = Number;
```

## Tests

- Unit tests are a `tests` array of cases with `args`, `description` and
    `expected` or `error`, with a minimal runner at the bottom. A case has a
    `method` when the cases of a file call different methods.
- Between the constants and the `tests` array go helper functions and
    tables of test data, each with a comment that says what it does or
    holds.
- Integration tests are a single test.

```js
// Find a route among routes, and get the keys of its hops
const routeKeys = args => {
  const {route} = method({...args, routes});

  return !route ? undefined : route.hops.map(n => n.public_key);
};

const tests = [
  {
    args: {pub_key: destination},
    description: 'The first route to the destination is found',
    expected: [a, destination],
  },
];

tests.forEach(({args, description, expected}) => {
  test(description, () => {
    deepStrictEqual(routeKeys(args), expected, 'Got expected result');
  });
});
```

## Markdown

In bullet lists, indent the 2nd and later lines of a bullet by 4 spaces:

```
- `makeInvoice`, `makeLnd`: Invoices have the features of LND invoices: 8, 14,
    17 and 25
```
