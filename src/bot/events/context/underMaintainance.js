const event = "underMaintenance";
export default class UnderMaintenance {
  constructor() {
    this.name = event;
    this.execute = async (client, ctx) => {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.warning} **Under Maintenance**\n\n` +
                `${client.emoji.info} **[Support](${client.config.links.support})**`,
            ),
        ],
      });
    };
  }
}
