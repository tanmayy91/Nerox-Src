import { Command } from "../../structures/abstract/command.js";
export default class Clear extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.usage = "<f/q/filter/queue>";
    this.description = "Clear queue/filters";
    this.options = [
      {
        name: "op",
        required: true,
        opType: "string",
        choices: [
          { name: "queue", value: "q" },
          { name: "filters", value: "f" },
        ],
        description: "option to clear (queue or filters)",
      },
    ];
    this.execute = async (client, ctx, args) => {
      const player = client.getPlayer(ctx);
      switch (args[0]?.toLowerCase()) {
        case "q":
        case "queue":
          player.queue.clear();
          await ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${client.emoji.check} Queue cleared successfully.`),
            ],
          });
          break;
        case "f":
        case "filters":
          await ctx
            .reply({
              embeds: [
                client
                  .embed()
                  .desc(
                    `${client.emoji.check} Please wait while I clear all applied filters.`,
                  ),
              ],
            })
            .then(async (reply) => {
              try {
                await player.shoukaku.clearFilters();
                await client.sleep(3);
                await reply.edit({
                  embeds: [
                    client
                      .embed()
                      .desc(
                        `${client.emoji.check} Filters cleared successfully.`,
                      ),
                  ],
                });
              } catch (err) {
                console.error("Failed to clear filters:", err);
                await reply.edit({
                  embeds: [
                    client
                      .embed()
                      .desc(
                        `${client.emoji.cross} Failed to clear filters. Please try again.`,
                      ),
                  ],
                }).catch(() => {});
              }
            })
            .catch((err) => {
              console.error("Failed to send filter clear message:", err);
            });
          break;
        default:
          await ctx.reply({
            embeds: [
              client
                .embed()
                .desc(
                  `${client.emoji.cross} Please provide a valid option \`q\` or \`f\` or \`queue\` or \`filters\`.`,
                ),
            ],
          });
          break;
      }
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
