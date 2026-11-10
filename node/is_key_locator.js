const isIndex = n => Number.isInteger(n) && n >= 0;

/** Determine if a key locator has a key family and a key index

  {
    family: <Key Family Number>
    index: <Key Index Number>
  }

  @returns
  <Key Locator Is Valid Bool>
*/
module.exports = ({family, index}) => isIndex(family) && isIndex(index);
