import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import os from "os";
import moment from "moment";
import { Command } from "../../structures/abstract/command.js";
import { filter } from "../../../lib/utils/filter.js";

export default class BotInfo extends Command {
  constructor() {
    super(...arguments);
    this.description = "Peek behind the scenes of the bot's core.";
  }

  async execute(client, ctx) {
    const totalUsers = client.guilds.cache.reduce(
      (acc, g) => acc + g.memberCount,
      0,
    );
    const uptime = moment.duration(client.uptime).humanize();
    const memoryUsage = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(
      2,
    );
    const cpuModel = os.cpus()[0].model;
    const nodeVersion = process.version;
    const platform = os.platform();
    const architecture = os.arch();
    const ping = client.ws.ping;
    const totalGuilds = client.guilds.cache.size;
    const totalChannels = client.channels.cache.size;
    const commandsCount = client.commands.size;
    const activePlayers = client.manager?.players?.size || 0;
    const shardCount = client.options.shardCount || 1;

    const embed = client
      .embed()
      .setAuthor({
        name: client.user.username,
        iconURL: client.user.displayAvatarURL(),
      })
      .setThumbnail(client.user.displayAvatarURL())
      .desc(
        `\`\`\`yml\n` +
          `Servers: ${totalGuilds.toLocaleString()}\n` +
          `Users: ${totalUsers.toLocaleString()}\n` +
          `Shards: ${shardCount}\n` +
          `Players: ${activePlayers}\n` +
          `Uptime: ${uptime}\n` +
          `Ping: ${ping}ms\n` +
          `\`\`\``,
      );

    const menu = new StringSelectMenuBuilder()
      .setCustomId("botinfo")
      .setPlaceholder("Select section")
      .setMaxValues(1)
      .addOptions([
        {
          label: "Overview",
          value: "overview",
          description: "Main info",
        },
        {
          label: "System",
          value: "system",
          description: "Technical info",
        },
        {
          label: "Developer",
          value: "developer",
          description: "Creator info",
        },
        {
          label: "Stats",
          value: "stats",
          description: "Statistics",
        },
      ]);

    const msg = await ctx.reply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(menu)],
    });

    const collector = msg.createMessageComponentCollector({
      idle: 30000,
      filter: (i) => filter(i, ctx),
    });

    collector.on("collect", async (interaction) => {
      await interaction.deferUpdate();
      const choice = interaction.values[0];

      let updatedEmbed;

      if (choice === "overview") {
        updatedEmbed = client
          .embed()
          .setAuthor({
            name: "Overview",
            iconURL: client.user.displayAvatarURL(),
          })
          .setThumbnail(client.user.displayAvatarURL())
          .desc(
            `\`\`\`yml\n` +
              `Servers: ${totalGuilds.toLocaleString()}\n` +
              `Users: ${totalUsers.toLocaleString()}\n` +
              `Shards: ${shardCount}\n` +
              `Players: ${activePlayers}\n` +
              `Uptime: ${uptime}\n` +
              `Ping: ${ping}ms\n` +
              `Prefix: ${client.prefix}\n` +
              `Channels: ${totalChannels.toLocaleString()}\n` +
              `\`\`\``,
          );
      } else if (choice === "system") {
        updatedEmbed = client
          .embed()
          .setAuthor({
            name: "System",
            iconURL: client.user.displayAvatarURL(),
          })
          .setThumbnail(client.user.displayAvatarURL())
          .desc(
            `\`\`\`yml\n` +
              `CPU: ${cpuModel.substring(0, 40)}\n` +
              `Memory: ${memoryUsage} MB\n` +
              `Platform: ${platform}\n` +
              `Architecture: ${architecture}\n` +
              `Node.js: ${nodeVersion}\n` +
              `\`\`\``,
          );
      } else if (choice === "developer") {
        updatedEmbed = client
          .embed()
          .setAuthor({
            name: "Developer",
            iconURL: client.user.displayAvatarURL(),
          })
          .setThumbnail(client.user.displayAvatarURL())
          .desc(
            `\`\`\`yml\n` +
              `Team: NeroX Studios\n` +
              `Version: 1.0.0\n` +
              `Framework: Discord.js v14\n` +
              `Database: MongoDB\n` +
              `\`\`\`\n` +
              `**[Support Server](https://discord.gg/duM4dkbz9N)**`,
          );
      } else if (choice === "stats") {
        updatedEmbed = client
          .embed()
          .setAuthor({
            name: "Statistics",
            iconURL: client.user.displayAvatarURL(),
          })
          .setThumbnail(client.user.displayAvatarURL())
          .desc(
            `\`\`\`yml\n` +
              `Commands: ${commandsCount}\n` +
              `Shard: 0/${shardCount}\n` +
              `Latency: ${ping}ms\n` +
              `Cache: ${client.users.cache.size} users\n` +
              `Active: ${activePlayers} players\n` +
              `\`\`\``,
          );
      }

      await msg.edit({ embeds: [updatedEmbed] });
    });

    collector.on("end", async () => {
      await msg.edit({ components: [] }).catch(() => null);
    });
  }
}
