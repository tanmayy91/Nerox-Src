const event = "infoRequested";
export default class InfoRequested {
  constructor() {
    this.name = event;
    this.execute = async (client, ctx, command) => {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.info} \`${command.name}\`\n\n` +
                `${command.description}\n` +
                `Aliases: \`${command.aliases.join(", ") || "None"}\`\n` +
                `Usage: \`${client.prefix}${command.name} ${command.usage}\``,
            ),
        ],
      });
    };
  }
}
