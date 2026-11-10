/** The fake nodes of fake LND objects

  A fake LND object is a key to the state of its fake node, so that helpers
  given the LND object can act on the node, like paying its invoices

  A WeakMap is used instead of a property on the LND object so that:

  - The LND object only has the sub-servers and methods that LND has, which
      keeps code that inspects the object, like `isLnd`, seeing it like LND
  - A fake node is released when its LND object is no longer used, so tests
      that make many fake LND objects do not keep all of their nodes alive

  <Fake Node Objects By Fake LND Object WeakMap Object>
*/
module.exports = new WeakMap();
