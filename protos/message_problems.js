const {Enum} = require('protobufjs');

const mapProblems = require('./map_problems');
const valueProblems = require('./value_problems');

const {entries} = Object;
const {isArray} = Array;
const isEnum = field => field.resolvedType instanceof Enum;
const isObject = n => !!n && typeof n === 'object' && !Array.isArray(n);

/** Get the problems with a message compared to its gRPC proto type

  Messages are compared to what the gRPC client gives: longs are strings,
  enums are strings, bytes are Buffers, and an unset message is null.

  Map keys of 64 bit numbers are 8 character strings of little-endian bytes.

  {
    [at]: <Path to the Message String>
    message: <Message Object>
    type: <Protobuf Type Object>
  }

  @returns
  {
    problems: [<Problem Description String>]
  }
*/
module.exports = ({at, message, type}) => {
  const path = at || type.name;

  // Exit early when the message is not an object
  if (!isObject(message)) {
    return {problems: [`${path}: expected ${type.name} message object`]};
  }

  const problems = entries(message).flatMap(([key, value]) => {
    const field = type.fields[key];
    const where = `${path}.${key}`;

    // A oneof is named by the field that is set
    if (!field && !!type.oneofs && !!type.oneofs[key]) {
      const names = type.oneofs[key].oneof;

      return names.includes(value) ? [] : [`${where}: expected oneof name`];
    }

    // Exit early when the field is not in the proto
    if (!field) {
      return [`${where}: unknown field of ${type.fullName.slice(1)}`];
    }

    // Exit early when the field is absent
    if (value === undefined) {
      return [];
    }

    // Exit early when checking a map field
    if (!!field.map) {
      return mapProblems({
        field,
        value,
        at: where,
        messageProblems: module.exports,
      });
    }

    // Exit early when checking a repeated field
    if (!!field.repeated) {
      if (!isArray(value)) {
        return [`${where}: expected array`];
      }

      return value.flatMap((n, i) => {
        return valueProblems({
          field,
          at: `${where}[${i}]`,
          messageProblems: module.exports,
          value: n,
        });
      });
    }

    // An unset message field is null
    if (value === null && !!field.resolvedType && !isEnum(field)) {
      return [];
    }

    return valueProblems({
      field,
      value,
      at: where,
      messageProblems: module.exports,
    });
  });

  return {problems};
};
