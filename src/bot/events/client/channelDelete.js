const event = "channelDelete";
export default class ChannelDelete {
  constructor() {
    this.name = event;
    this.execute = async (client, channel) => {
      if (channel.isDMBased()) return;
      const player = client.getPlayer(channel);
      if (!player || player?.textId !== channel.id) return;
      await player.destroy();
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
