import { Command } from "../../structures/abstract/command.js";

export default class Prefix extends Command {
  constructor() {
    super(...arguments);
    this.description = "Set custom prefix for this server";
    this.usage = "<prefix>";
    this.serveradmin = true;
    this.options = [
      {
        name: "prefix",
        opType: "string",
        description: "New prefix (max 2 characters, no emojis)",
        required: true,
      },
    ];
  }

  execute = async (client, ctx, args) => {
    if (!args.length) {
      const currentPrefix =
        (await client.db.prefix.get(ctx.guild.id)) || client.prefix;
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.info} **Current Prefix:** \`${currentPrefix}\`\n\n` +
                `${client.emoji.info1} Use \`${currentPrefix}prefix <new_prefix>\` to change it.`,
            ),
        ],
      });
      return;
    }

    const newPrefix = args[0];

    // Validation: Maximum 2 characters
    if (newPrefix.length > 2) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} Prefix must be maximum 2 characters long!`,
            ),
        ],
      });
      return;
    }

    // Validation: No emojis (check for unicode emoji patterns and discord emoji format)
    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]|<a?:\w+:\d+>/gu;
    if (emojiRegex.test(newPrefix)) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(`${client.emoji.cross} Prefix cannot contain emojis!`),
        ],
      });
      return;
    }

    // Validation: Only alphanumeric and symbols
    const validRegex = /^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]+$/;
    if (!validRegex.test(newPrefix)) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} Prefix must contain only:\n` +
                `${client.emoji.info1} Letters (a-z, A-Z)\n` +
                `${client.emoji.info1} Numbers (0-9)\n` +
                `${client.emoji.info1} Symbols (!@#$%^&*...)`,
            ),
        ],
      });
      return;
    }

    // Set the new prefix
    await client.db.prefix.set(ctx.guild.id, newPrefix);

    await ctx.reply({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.check} **Prefix Updated Successfully!**\n\n` +
              `${client.emoji.info} **New Prefix:** \`${newPrefix}\`\n` +
              `${client.emoji.info} **Example:** \`${newPrefix}play song name\``,
          ),
      ],
    });
  };
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
