const typeAsKey = require('./type_as_key');

const emptyRegularOnion = '00'.repeat(1366);
const hexAsBuffer = hex => Buffer.from(hex, 'hex');

/** Make an onion message update, as LND gives a received onion message

  The arguments are the message as `subscribeToMessages` describes it

  {
    encrypted: <Encrypted Recipient Data Hex String>
    key: <Path Key Hex String>
    [message]: {
      type: <Message Payload Record Type Number String>
      value: <Message Payload Hex String>
    }
    [onion]: <Onion Packet Hex String>
    [reply]: {
      inbound: [{
        encrypted_data: <Encrypted Data Hex String>
        relay_key: <Blinded Relay Key Hex String>
      }]
      introduction_node: <Introduction Node Public Key Hex String>
      key: <Path Key Hex String>
    }
    via: <Received From Peer Public Key Hex String>
  }

  @returns
  <OnionMessageUpdate Object>
*/
module.exports = args => {
  const records = {};

  if (!!args.message) {
    const {key} = typeAsKey({type: args.message.type});

    records[key] = hexAsBuffer(args.message.value);
  }

  // A message with a reply path has the path to send replies over
  const replyPath = (() => {
    // Exit early when there is no reply path
    if (!args.reply) {
      return undefined;
    }

    return {
      blinded_hops: args.reply.inbound.map(hop => ({
        blinded_node: hexAsBuffer(hop.relay_key),
        encrypted_data: hexAsBuffer(hop.encrypted_data),
      })),
      blinding_point: hexAsBuffer(args.reply.key),
      introduction_node: hexAsBuffer(args.reply.introduction_node),
    };
  })();

  return {
    custom_records: records,
    encrypted_recipient_data: hexAsBuffer(args.encrypted),
    onion: hexAsBuffer(args.onion || emptyRegularOnion),
    path_key: hexAsBuffer(args.key),
    peer: hexAsBuffer(args.via),
    reply_path: replyPath,
  };
};
