/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */
import { Command } from "../../structures/abstract/command.js";
export default class Shuffle extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.aliases = ["sh"];
    this.description = "Shuffle the queue";
    this.execute = async (client, ctx) => {
      client.getPlayer(ctx).queue.shuffle();
      await ctx.reply({
        embeds: [
          client.embed().desc(`${client.emoji.check} Shuffled the queue.`),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
