/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */
import { Command } from "../../structures/abstract/command.js";
export default class Volume extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.aliases = ["v", "vol"];
    this.description = "Adjust player volume";
    this.options = [
      {
        name: "volume",
        required: false,
        opType: "string",
        description: "volume ( 150 > V > 0)",
      },
    ];
    this.execute = async (client, ctx, args) => {
      const player = client.getPlayer(ctx);
      const parsedVolume = parseInt(args[0]);
      const volume = !isNaN(parsedVolume) && parsedVolume > 0 
        ? Math.ceil(parsedVolume) 
        : player.volume;
      
      if (volume > 150 || volume < 1) {
        await ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.cross} Volume must be greater than \`0\` and lesser than \`150\`.`,
              ),
          ],
        });
        return;
      }
      player.setVolume(volume);
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.check} Current volume for player is \`${volume}%\`.`,
            ),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
