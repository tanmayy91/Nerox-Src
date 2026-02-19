import { Command } from "../../structures/abstract/command.js";
import { updatePlayerButtons } from "../../../lib/services/updatePlayerButtons.js";
export default class Pause extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.description = "Pause playing player";
    this.execute = async (client, ctx) => {
      const player = client.getPlayer(ctx);
      if (!player.playing) {
        await ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.cross} There currently is no playing player in this guild.`,
              ),
          ],
        });
        return;
      }
      player.pause(true);
      await updatePlayerButtons(client, player);
      await ctx.reply({
        embeds: [
          client.embed().desc(`${client.emoji.check} Paused the player.`),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
