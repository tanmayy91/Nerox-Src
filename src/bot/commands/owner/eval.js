/**
 * @nerox v1.0.0
 * @author Tanmay
 */
import { Command } from "../../structures/abstract/command.js";
import util from "util";

export default class Eval extends Command {
  constructor() {
    super(...arguments);
    this.owner = true;
    this.aliases = ["ev", "evaluate"];
    this.usage = "<code>";
    this.description = "Evaluate JavaScript code";
    this.execute = async (client, ctx, args) => {
      if (!args.length) {
        await ctx.reply({
          embeds: [
            client
              .embed()
              .desc(`${client.emoji.cross} Please provide code to evaluate.`),
          ],
        });
        return;
      }

      const code = args.join(" ");
      const startTime = Date.now();

      try {
        let evaled = eval(code);

        if (evaled instanceof Promise) {
          evaled = await evaled;
        }

        const executionTime = Date.now() - startTime;

        if (typeof evaled !== "string") {
          evaled = util.inspect(evaled, { depth: 0 });
        }

        // Clean sensitive data
        evaled = evaled
          .replace(new RegExp(client.token, "g"), "[TOKEN]")
          .replace(/[\w-]{24}\.[\w-]{6}\.[\w-]{27}/g, "[TOKEN]");

        const output =
          evaled.length > 1900 ? evaled.substring(0, 1900) + "..." : evaled;

        const embed = client
          .embed()
          .setAuthor({
            name: `${client.user.username} - Eval`,
            iconURL: client.user.displayAvatarURL(),
          })
          .setDescription(
            `**Input**\n\`\`\`js\n${code.substring(0, 1000)}\n\`\`\`\n` +
              `**Output**\n\`\`\`js\n${output}\n\`\`\`\n` +
              `${client.emoji.timer} Execution Time: \`${executionTime}ms\``,
          )
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
      } catch (error) {
        const executionTime = Date.now() - startTime;

        const embed = client
          .embed()
          .setAuthor({
            name: `${client.user.username} - Eval Error`,
            iconURL: client.user.displayAvatarURL(),
          })
          .setDescription(
            `**Input**\n\`\`\`js\n${code.substring(0, 1000)}\n\`\`\`\n` +
              `**Error**\n\`\`\`js\n${error.message}\n\`\`\`\n` +
              `${client.emoji.timer} Execution Time: \`${executionTime}ms\``,
          )
          .setTimestamp();

        await ctx.reply({ embeds: [embed] });
      }
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
