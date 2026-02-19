import { Command } from "../../structures/abstract/command.js";
import { updatePlayerButtons } from "../../../lib/services/updatePlayerButtons.js";
export default class Autoplay extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.aliases = ["ap"];
    this.description = "Toggle autoplay";
    this.execute = async (client, ctx) => {
      const player = client.getPlayer(ctx);
      const currentStatus = player.data.get("autoplayStatus") ? true : false;
      currentStatus
        ? player.data.delete("autoplayStatus")
        : player.data.set("autoplayStatus", true);
      await updatePlayerButtons(client, player);
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.check} Set autoplay mode to \`${!currentStatus ? `enabled` : `disabled`}\`.`,
            ),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
