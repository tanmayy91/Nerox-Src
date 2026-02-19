import moment from "moment";

export const execute = async (ctx, command, args) => {
  if (!ctx || !ctx.guild || !ctx.channel || !ctx.author) {
    console.error("ctx is missing required properties!", ctx);
    return;
  }

  const { client } = ctx;

  try {
    if (!command || !command.execute) {
      console.error(`Command ${command?.name || "Unknown"} is not executable.`);
      return;
    }

    await command.execute(client, ctx, args);

    const date = moment().tz("Asia/Kolkata").format("DD-MM-YYYY");

    await Promise.all([
      client.db.stats.commandsUsed.set(
        date,
        ((await client.db.stats.commandsUsed.get(date)) ?? 0) + 1,
      ),
      client.db.stats.commandsUsed.set(
        "total",
        ((await client.db.stats.commandsUsed.get("total")) ?? 0) + 1,
      ),
      client.db.stats.commandsUsed.set(
        ctx.guild.id,
        ((await client.db.stats.commandsUsed.get(ctx.guild.id)) ?? 0) + 1,
      ),
      client.db.stats.commandsUsed.set(
        ctx.author.id,
        ((await client.db.stats.commandsUsed.get(ctx.author.id)) ?? 0) + 1,
      ),
    ]).catch((err) => console.error("Failed to update stats:", err));

    if (client.webhooks?.logs) {
      await client.webhooks.logs
        .send({
          username: `Command-logs`,
          avatarURL: client.user?.displayAvatarURL(),
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.info} **Command \`${command.name}\` used**\n\n` +
                  `${client.emoji.info} **Content:** ${ctx.content}\n` +
                  `${client.emoji.info} **User:** ${ctx.author.tag} \`[${ctx.author.id}]\`\n` +
                  `${client.emoji.info} **Guild:** ${ctx.guild.name} \`[${ctx.guild.id}]\`\n` +
                  `${client.emoji.info} **Channel:** ${ctx.channel.name} \`[${ctx.channel.id}]\``,
              ),
          ],
        })
        .catch((err) => console.error("Failed to send command log:", err));
    } else {
      console.error("Webhook cmdLogs is undefined!");
    }
  } catch (err) {
    console.error(
      `Error executing command ${command?.name || "Unknown"}:`,
      err,
    );
    
    // Notify user of the error
    try {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} An error occurred while executing the command. Please try again later.`,
            ),
        ],
      }).catch(() => {}); // Ignore if reply fails
    } catch (replyErr) {
      console.error("Failed to send error message to user:", replyErr);
    }
  }
};

/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
