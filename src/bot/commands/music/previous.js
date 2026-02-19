import { Command } from "../../structures/abstract/command.js";
export default class Previous extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.aliases = ["prev"];
    this.description = "Plays previous song";
    this.execute = async (client, ctx) => {
      const player = client.getPlayer(ctx);
      const previousTrack = player.queue.previous.pop();
      if (!previousTrack) {
        await ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.cross} There are no previously played song/s.`,
              ),
          ],
        });
        return;
      }
      player.queue.unshift(player.queue.current);
      player.queue.unshift(previousTrack);
      await player.shoukaku.stopTrack();
      // Note: We already popped once above, don't pop again
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.check} Playing previous song ${previousTrack.title?.substring(0, 13) || "Unknown"}.`,
            ),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
