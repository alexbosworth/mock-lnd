/** Make a response for pending channels

  {}

  @returns
  <PendingChannels Response Object>
*/
module.exports = ({}) => {
  return {
    pending_force_closing_channels: [],
    pending_open_channels: [],
    waiting_close_channels: [],
  };
};
