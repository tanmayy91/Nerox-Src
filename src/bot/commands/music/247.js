/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */
import { Command } from "../../structures/abstract/command.js";
export default class Autoplay extends Command {
  constructor() {
    super(...arguments);
    this.player = true;
    this.inSameVC = true;
    this.description = "Toggle 247 mode";
    this.execute = async (client, ctx) => {
      const currentStatus = await client.db.twoFourSeven.get(ctx.guild.id);
      if (currentStatus) {
        await client.db.twoFourSeven.delete(ctx.guild.id);
        await ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.check} 24/7 mode **deactivated**`,
              ),
          ],
        });
        return;
      }
      const player = client.getPlayer(ctx);
      await client.db.twoFourSeven.set(ctx.guild.id, {
        textId: player.textId,
        voiceId: player.voiceId,
      });
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.check} 24/7 mode **activated**\n` +
                `Text: <#${player.textId}> | Voice: <#${player.voiceId}>`,
            ),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
