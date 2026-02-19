/**
 * @nerox v1.0.0
 * @author Tanmay
 * @copyright 2024 NeroX - Services
 */

import { Command } from "../../structures/abstract/command.js";

export default class Ping extends Command {
  constructor() {
    super(...arguments);
    this.aliases = ["latency", "pong"];
    this.description = "Displays latency stats";
  }

  execute = async (client, ctx) => {
    const msg = await ctx.reply({
      embeds: [client.desc(`Checking latency...`)],
    });

    const start = performance.now();
    await client.db.blacklist.set("test", true);
    await client.db.blacklist.get("test");
    await client.db.blacklist.delete("test");
    const dbLatency = (performance.now() - start).toFixed(2);

    const wsLatency = client.ws.ping.toFixed(2);
    const msgLatency = msg.createdTimestamp - ctx.createdTimestamp;

    const embed = client
      .embed()
      .setAuthor({
        name: `${client.user.username} - Latency`,
        iconURL: client.user.displayAvatarURL(),
      })
      .desc(
        `**WebSocket:** ${wsLatency}ms\n` +
          `**Database:** ${dbLatency}ms\n` +
          `**Message:** ${msgLatency}ms`,
      )
      .footer({
        text: `Requested by ${ctx.author.username}`,
        iconURL: ctx.author.displayAvatarURL(),
      });

    await msg.edit({ content: null, embeds: [embed] });
  };
}
