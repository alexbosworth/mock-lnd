const keyProblems = require('./key_problems');
const valueProblems = require('./value_problems');

const {entries} = Object;
const isObject = n => !!n && typeof n === 'object' && !Array.isArray(n);
const {stringify} = JSON;

/** Get the problems with a map

  {
    at: <Path to the Map String>
    field: <Protobuf Map Field Object>
    messageProblems: <Get Problems of a Message Function>
    value: <Map Object>
  }

  @returns
  [<Problem Description String>]
*/
module.exports = ({at, field, messageProblems, value}) => {
  if (!isObject(value)) {
    return [`${at}: expected map object`];
  }

  return entries(value).flatMap(([key, n]) => {
    const where = `${at}[${stringify(key)}]`;

    return []
      .concat(keyProblems({key, at: where, type: field.keyType}))
      .concat(valueProblems({field, messageProblems, at: where, value: n}));
  });
};
