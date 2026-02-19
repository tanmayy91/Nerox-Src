/**
 * @nerox v1.0.0
 * @author Tanmay
 */
import { Command } from "../../structures/abstract/command.js";
import { paginator } from "../../../lib/utils/paginator.js";

export default class Servers extends Command {
  constructor() {
    super(...arguments);
    this.owner = true;
    this.aliases = ["guilds", "serverlist"];
    this.description = "List all servers the bot is in";
    this.execute = async (client, ctx) => {
      const guilds = Array.from(client.guilds.cache.values()).sort(
        (a, b) => b.memberCount - a.memberCount,
      );

      const pages = [];
      const guildsPerPage = 10;

      for (let i = 0; i < guilds.length; i += guildsPerPage) {
        const guildChunk = guilds.slice(i, i + guildsPerPage);

        const description = guildChunk
          .map((guild, index) => {
            const owner = guild.ownerId;
            return (
              `**${i + index + 1}.** ${guild.name}\n` +
              `${client.emoji.info} ID: \`${guild.id}\`\n` +
              `${client.emoji.info} Members: \`${guild.memberCount}\`\n` +
              `${client.emoji.info} Owner: <@${owner}>\n`
            );
          })
          .join("\n");

        const embed = client
          .embed()
          .setAuthor({
            name: `${client.user.username} - Server List`,
            iconURL: client.user.displayAvatarURL(),
          })
          .setTitle(`Total Servers: ${guilds.length}`)
          .setDescription(description)
          .footer({
            text: `Page ${Math.floor(i / guildsPerPage) + 1}/${Math.ceil(guilds.length / guildsPerPage)} • Owner Only`,
            iconURL: ctx.author.displayAvatarURL(),
          })
          .setTimestamp();

        pages.push(embed);
      }

      if (pages.length === 0) {
        await ctx.reply({
          embeds: [
            client.embed().desc(`${client.emoji.warn} No servers found.`),
          ],
        });
        return;
      }

      await paginator(ctx, pages);
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
