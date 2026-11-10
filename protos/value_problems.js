const {Enum} = require('protobufjs');

const isInRange = require('./is_in_range');

const floatTypes = ['double', 'float'];
const intTypes = ['fixed32', 'int32', 'sfixed32', 'sint32', 'uint32'];
const isBytes = n => Buffer.isBuffer(n) || n instanceof Uint8Array;
const {isInteger} = Number;
const isLong = n => typeof n === 'string' && /^-?\d+$/.test(n);
const isNumber = n => typeof n === 'number' && Number.isFinite(n);
const longTypes = ['fixed64', 'int64', 'sfixed64', 'sint64', 'uint64'];
const outOfRange = (at, type) => `${at}: out of ${type} range`;

/** Get the problems with a single value of a field

  {
    at: <Path to the Value String>
    field: <Protobuf Field Object>
    messageProblems: <Get Problems of a Message Function>
    value: <Field Value>
  }

  @returns
  [<Problem Description String>]
*/
module.exports = ({at, field, messageProblems, value}) => {
  // Enums are the names of their values
  if (field.resolvedType instanceof Enum) {
    if (typeof value !== 'string') {
      return [`${at}: expected ${field.resolvedType.name} name string`];
    }

    if (field.resolvedType.values[value] === undefined) {
      return [`${at}: ${value} is not a ${field.resolvedType.name}`];
    }

    return [];
  }

  // Messages are checked field by field
  if (!!field.resolvedType) {
    const type = field.resolvedType;

    return messageProblems({at, type, message: value}).problems;
  }

  if (longTypes.includes(field.type)) {
    if (!isLong(value)) {
      return [`${at}: expected ${field.type} as string`];
    }

    if (!isInRange({value, type: field.type})) {
      return [outOfRange(at, field.type)];
    }

    return [];
  }

  if (floatTypes.concat(intTypes).includes(field.type)) {
    if (!isNumber(value)) {
      return [`${at}: expected ${field.type} as number`];
    }

    // Floating point numbers can be any finite number
    if (floatTypes.includes(field.type)) {
      return [];
    }

    if (!isInteger(value)) {
      return [`${at}: expected ${field.type} as whole number`];
    }

    if (!isInRange({value, type: field.type})) {
      return [outOfRange(at, field.type)];
    }

    return [];
  }

  switch (field.type) {
  case 'bool':
    return typeof value === 'boolean' ? [] : [`${at}: expected bool`];

  case 'bytes':
    return isBytes(value) ? [] : [`${at}: expected bytes as Buffer`];

  case 'string':
    return typeof value === 'string' ? [] : [`${at}: expected string`];

  default:
    return [`${at}: unexpected field type ${field.type}`];
  }
};
