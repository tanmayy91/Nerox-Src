import moment from "moment-timezone";
import { ActionRowBuilder } from "discord.js";
const event = "guildCreate";
export default class GuildCreate {
  constructor() {
    this.name = event;
    this.execute = async (client, guild) => {
      if (!guild?.name) return;
      const owner = await guild.fetchOwner({ force: true }).catch(() => null);
      const logs = await guild.fetchAuditLogs({ type: 28 }).catch(() => null);
      const adder =
        logs?.entries
          .filter((entry) => entry.target?.id === client.user.id)
          .first()?.executor || null;
      const obj = {
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.check} Successfully added to \`${guild.name}\`\n\n` +
                `${client.emoji.info} **[\`Support\`](${client.config.links.support})**`,
            ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            client
              .button()
              .link("Support Server", `${client.config.links.support}`),
          ),
        ],
      };
      await owner?.send(obj).catch(() => null);
      if (adder?.id !== owner?.id) await adder?.send(obj).catch(() => null);
      await client.webhooks.serveradd.send({
        username: `GuildCreate-logs`,
        avatarURL: `${client.user?.displayAvatarURL()}`,
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.check} **Joined ${guild.name}**\n\n` +
                `${client.emoji.info} Members: ${guild.memberCount}\n` +
                `${client.emoji.info} ID: ${guild.id}\n` +
                `${client.emoji.info} Owner: ${owner?.user.displayName}\n` +
                `${client.emoji.info} Adder: ${adder?.username}`,
            ),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
