const asHex = bytes => Buffer.from(bytes).toString('hex');

/** Select a route for a query, as LND finds a route that avoids ignored nodes
  and pairs

  {
    ignored_nodes: [<Ignored Node Public Key Buffer Object>]
    ignored_pairs: [{
      from: <From Node Public Key Buffer Object>
      to: <To Node Public Key Buffer Object>
    }]
    pub_key: <Destination Public Key Hex String>
    routes: [{
      hops: [{
        [channel]: <Standard Format Channel Id String>
        public_key: <Hop Public Key Hex String>
      }]
    }]
    source: <Route Source Public Key Hex String>
  }

  @returns
  {
    [route]: {
      hops: [{
        [channel]: <Standard Format Channel Id String>
        public_key: <Hop Public Key Hex String>
      }]
    }
  }
*/
module.exports = args => {
  const ignoredNodes = (args.ignored_nodes || []).map(asHex);

  const ignoredPairs = (args.ignored_pairs || []).map(pair => ({
    from: asHex(pair.from),
    to: asHex(pair.to),
  }));

  const route = args.routes.find(({hops}) => {
    const [destination] = hops.slice().reverse();

    // The route has to end at the destination
    if (!destination || destination.public_key !== args.pub_key) {
      return false;
    }

    // The route cannot go through an ignored node
    if (hops.some(hop => ignoredNodes.includes(hop.public_key))) {
      return false;
    }

    const keys = [args.source].concat(hops.map(n => n.public_key));

    // The route cannot go over an ignored pair
    return !keys.slice(1).some((key, i) => {
      return ignoredPairs.some(n => n.from === keys[i] && n.to === key);
    });
  });

  return {route};
};
