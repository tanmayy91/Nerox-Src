const event = "voiceStateUpdate";
export default class AutoDestroy {
  constructor() {
    this.name = event;
    this.execute = async (client, oldState, newState) => {
      if (newState.member?.voice.channelId) return;
      if (newState.member?.id !== client.user?.id) return;
      await client.getPlayer(newState)?.destroy();
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
