import moment from "moment-timezone";
import { ActionRowBuilder } from "discord.js";
const event = "blUser";
export default class BlacklistUser {
  constructor() {
    this.name = event;
    this.execute = async (client, ctx) => {
      await client.db.blacklist.set(ctx.author.id, true);
      const replyObject = {
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.bl} Blacklisted for spam\n\n` +
                `${client.emoji.info} **[\`Support\`](${client.config.links.support})**`,
            ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            client.button().link("Support", client.config.links.support),
          ),
        ],
      };
      await ctx.react(client.emoji.bl, {
        content: "Blacklisted - Check DMs",
      });
      await ctx.author.send(replyObject).catch(() => null);
      await client.webhooks.blLogs.send({
        username: `Auto-blacklist-logs`,
        avatarURL: `${client.user?.displayAvatarURL()}`,
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.bl} Blacklisted\n\n` +
                `${client.emoji.info} User: ${ctx.author.tag}\n` +
                `${client.emoji.info} Guild: ${ctx.guild.name.substring(0, 20)}\n` +
                `${client.emoji.info} Channel: ${ctx.channel.name}`,
            ),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
