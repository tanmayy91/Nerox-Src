/**
 * @nerox v1.0.0
 * @author Tanmay
 * @copyright 2024 NeroX - Services
 */
import { Command } from "../../structures/abstract/command.js";
import { paginator } from "../../../lib/utils/paginator.js";

export default class Stats extends Command {
  constructor() {
    super(...arguments);
    this.aliases = ["status"];
    this.description = "Displays bot statistics with navigation.";
    this.execute = async (client, ctx) => {
      const pages = await this.getStatsPages(client, ctx);
      await paginator(ctx, pages);
    };
  }

  async getStatsPages(client, ctx) {
    const totalUsers = client.guilds.cache.reduce(
      (total, guild) => total + guild.memberCount,
      0,
    );
    const cpuUsage = (await import("os-utils")).default.cpuUsage;
    const _cpuUsage = await new Promise((resolve) => cpuUsage(resolve));
    const activePlayers = client.manager?.players?.size || 0;
    const shardCount = client.options.shardCount || 1;

    const generalStatsEmbed = client
      .embed()
      .setAuthor({
        name: `${client.user.username} Statistics`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setThumbnail(client.user.displayAvatarURL())
      .desc(
        `**Network**\n` +
          `Servers: **${client.guilds.cache.size.toLocaleString()}**\n` +
          `Users: **${totalUsers.toLocaleString()}**\n\n` +
          `**Performance**\n` +
          `Uptime: **${client.formatDuration(client.uptime)}**\n` +
          `Latency: **${client.ws.ping}ms**\n\n` +
          `**Memory**\n` +
          `Heap Used: **${client.formatBytes(process.memoryUsage().heapUsed)}**\n` +
          `Heap Total: **${client.formatBytes(process.memoryUsage().heapTotal)}**\n\n` +
          `**Music**\n` +
          `Active Players: **${activePlayers}**`,
      )
      .footer({
        text: `Page 1/3 | Requested by ${ctx.author.tag}`,
        iconURL: ctx.author.displayAvatarURL(),
      })
      .setTimestamp();

    const shardInfo = await client.cluster.broadcastEval((c) => ({
      id: c.ws.shards.first().id,
      ping: c.ws.ping,
      guilds: c.guilds.cache.size,
      status: c.ws.status,
    }));

    const shardInfoEmbed = client
      .embed()
      .setAuthor({
        name: `${client.user.username} Shard Info`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setThumbnail(client.user.displayAvatarURL())
      .desc(
        `**Shards:** ${shardCount}\n\n` +
          (shardInfo.length > 0
            ? shardInfo
                .map(
                  (shard) =>
                    `**Shard ${shard.id}**\n` +
                    `Servers: **${shard.guilds.toLocaleString()}**\n` +
                    `Latency: **${shard.ping}ms**\n` +
                    `Status: **${shard.status === 0 ? "Online" : "Connecting"}**`,
                )
                .join("\n\n")
            : `Shard details unavailable.`),
      )
      .footer({
        text: `Page 2/3 | Total Shards: ${shardInfo.length}`,
        iconURL: ctx.author.displayAvatarURL(),
      })
      .setTimestamp();

    const systemInfoEmbed = client
      .embed()
      .setAuthor({
        name: `${client.user.username} System Info`,
        iconURL: client.user.displayAvatarURL(),
      })
      .setThumbnail(client.user.displayAvatarURL())
      .desc(
        `**Hardware**\n` +
          `CPU Usage: **${(_cpuUsage * 100).toFixed(2)}%**\n` +
          `RSS Memory: **${client.formatBytes(process.memoryUsage().rss)}**\n` +
          `Platform: **${process.platform}** (${process.arch})\n\n` +
          `**Software**\n` +
          `Node.js: **${process.version}**\n` +
          `Discord.js: **v14.15.2**\n\n` +
          `**Bot**\n` +
          `Commands: **${client.commands.size}**\n` +
          `Event Listeners: **${client.eventNames().length}**\n` +
          `PID: **${process.pid}**`,
      )
      .footer({
        text: `Page 3/3 | Version: v1.0.0`,
        iconURL: ctx.author.displayAvatarURL(),
      })
      .setTimestamp();

    return [generalStatsEmbed, shardInfoEmbed, systemInfoEmbed];
  }
}
