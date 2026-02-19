import { Command } from "../../structures/abstract/command.js";

export default class Afk extends Command {
  constructor() {
    super(...arguments);
    this.description = "Set yourself as AFK";
    this.usage = "[reason]";
    this.options = [
      {
        name: "reason",
        opType: "string",
        description: "Reason for being AFK",
        required: false,
      },
    ];
  }

  execute = async (client, ctx, args) => {
    const reason = args.join(" ") || "No reason provided";
    const afkData = {
      reason: reason,
      timestamp: Date.now(),
    };

    await client.db.afk.set(ctx.author.id, afkData);

    await ctx.reply({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.check} **AFK Mode Activated**\n\n` +
              `${client.emoji.info} **Reason:** ${reason}\n` +
              `${client.emoji.info} I'll notify others when they mention you!`,
          ),
      ],
    });
  };
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
