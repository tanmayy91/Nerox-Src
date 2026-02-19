import { Command } from "../../structures/abstract/command.js";
import { updatePlayerButtons } from "../../../lib/services/updatePlayerButtons.js";
export default class Resume extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.description = "Resume paused player";
    this.execute = async (client, ctx) => {
      const player = client.getPlayer(ctx);
      if (!player.paused) {
        await ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.cross} There currently is no paused player in this guild.`,
              ),
          ],
        });
        return;
      }
      player.pause(false);
      await updatePlayerButtons(client, player);
      await ctx.reply({
        embeds: [
          client.embed().desc(`${client.emoji.check} Resumed the player.`),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
