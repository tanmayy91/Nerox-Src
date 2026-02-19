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
                `${client.emoji.check} **Boom!** 247 mode **deactivated**\n\n` +
                  `${client.emoji.info} All 247 data wiped clean! Time to chill.`,
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
              `${client.emoji.check} **Yo!** 247 mode **activated**\n\n` +
                `${client.emoji.info} It's set! Text Channel: <#${player.textId}> and Voice Channel: <#${player.voiceId}>. Now it's on!`,
            ),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
