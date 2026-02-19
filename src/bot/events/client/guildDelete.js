import moment from "moment-timezone";
import { ActionRowBuilder } from "discord.js";
const event = "guildDelete";
export default class GuildDelete {
  constructor() {
    this.name = event;
    this.execute = async (client, guild) => {
      if (!guild?.name) return;
      const owner = await client.users
        .fetch(guild.ownerId, { force: true })
        .catch(() => null);
      await client.db?.twoFourSeven.delete(guild.id);
      await owner
        ?.send({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.warn} Removed from \`${guild.name}\`\n\n` +
                  `${client.emoji.info} **[\`Support\`](${client.config.links.support})**`,
              ),
          ],
          components: [
            new ActionRowBuilder().addComponents(
              client
                .button()
                .link("Support Server", `${client.config.links.support}`),
              client
                .button()
                .link("Add me back", `${client.invite.required()}`),
            ),
          ],
        })
        .catch(() => null);
      await client.webhooks.serverchuda.send({
        username: `GuildLeave-logs`,
        avatarURL: `${client.user?.displayAvatarURL()}`,
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.warn} **Left ${guild.name}**\n\n` +
                `${client.emoji.info} Members: ${guild.memberCount}\n` +
                `${client.emoji.info} ID: ${guild.id}\n` +
                `${client.emoji.info} Owner: ${owner?.displayName}`,
            ),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
