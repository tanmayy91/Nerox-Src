import { paginator } from "../../../lib/utils/paginator.js";
import { Command } from "../../structures/abstract/command.js";

export default class Ignore extends Command {
  constructor() {
    super(...arguments);
    this.serveradmin = true; // Only Server Admins can use this command
    this.aliases = ["ignorechannel", "igch"];
    this.description = "Ignore or unignore a channel from using bot commands.";
    this.options = [
      {
        name: "action",
        opType: "string",
        description: "Add / remove / list ignored channels",
        required: true,
        choices: [
          { name: "add", value: "add" },
          { name: "remove", value: "remove" },
          { name: "list", value: "list" },
        ],
      },
      {
        name: "channel",
        opType: "channel",
        required: false,
        description: "Channel to ignore / unignore",
      },
    ];
  }

  execute = async (client, ctx, args) => {
    if (!["add", "remove", "list"].includes(args[0]?.toLowerCase())) {
      return ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} Please specify a valid action: \`add\`, \`remove\`, or \`list\`.`,
            ),
        ],
      });
    }

    if (args[0].toLowerCase() === "list") {
      const ignoredChannels = await client.db.ignore.keys;
      if (!ignoredChannels.length) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(`${client.emoji.cross} No channels are ignored.`),
          ],
        });
      }

      const channelNames = ignoredChannels.map(
        (id, index) => `${index + 1}. <#${id}> (\`${id}\`)`,
      );
      const embeds = client
        .embed()
        .setTitle(`${client.emoji.check} Ignored Channels`)
        .desc(channelNames.join("\n"));
      return paginator(ctx, [embeds]);
    }

    const targetChannel = ctx.mentions.channels.first() || ctx.channel;
    const isIgnored = await client.db.ignore.has(targetChannel.id);

    if (args[0].toLowerCase() === "add") {
      if (isIgnored) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(`${client.emoji.cross} This channel is already ignored.`),
          ],
        });
      }
      await client.db.ignore.set(targetChannel.id, true);
      return ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.check} Successfully ignored <#${targetChannel.id}>. Commands will no longer work here.`,
            ),
        ],
      });
    }

    if (args[0].toLowerCase() === "remove") {
      if (!isIgnored) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(`${client.emoji.cross} This channel is not ignored.`),
          ],
        });
      }
      await client.db.ignore.delete(targetChannel.id);
      return ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.check} Successfully removed <#${targetChannel.id}> from ignored channels.`,
            ),
        ],
      });
    }
  };
}
