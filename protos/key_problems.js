const isInRange = require('./is_in_range');

const longKeyLength = 8;
const longTypes = ['fixed64', 'int64', 'sfixed64', 'sint64', 'uint64'];

/** Get the problems with the key of a map

  Keys of 64 bit numbers are strings of their little-endian bytes

  {
    at: <Path to the Key String>
    key: <Map Key String>
    type: <Key Proto Type String>
  }

  @returns
  [<Problem Description String>]
*/
module.exports = ({at, key, type}) => {
  // Keys of 64 bit numbers are strings of their little-endian bytes
  if (longTypes.includes(type)) {
    return key.length === longKeyLength ? [] : [`${at}: expected 8 byte key`];
  }

  if (type === 'bool') {
    return ['false', 'true'].includes(key) ? [] : [`${at}: expected bool key`];
  }

  if (type === 'string') {
    return [];
  }

  if (!/^-?\d+$/.test(key) || !isInRange({type, value: key})) {
    return [`${at}: expected ${type} key`];
  }

  return [];
};
