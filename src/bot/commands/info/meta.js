/**
 * @nerox v1.0.0
 * @author Tanmay
 */
import _ from "lodash";
import { Command } from "../../structures/abstract/command.js";
import { paginator } from "../../../lib/utils/paginator.js";
import { getCodeStats } from "../../../lib/utils/codestats.js";

export default class CodeStats extends Command {
  constructor() {
    super(...arguments);
    this.dev = true;
    this.aliases = ["codestats", "cs", "codeinfo"];
    this.description = "View full details about the bot's codebase.";
    this.execute = async (client, ctx) => {
      const msg = await ctx.reply({
        embeds: [
          client.embed().desc(`${client.emoji.loading} Analyzing codebase...`),
        ],
      });

      const stats = await getCodeStats();

      const info = [
        `**Codebase Overview**\n`,
        `**Structure**`,
        `${client.emoji.info} Total Files: \`${stats.files}\``,
        `${client.emoji.info} Directories: \`${stats.directories}\`\n`,
        `**Code Metrics**`,
        `${client.emoji.info} Total Lines: \`${stats.lines.toLocaleString()}\``,
        `${client.emoji.info} Characters: \`${stats.characters.toLocaleString()}\``,
        `${client.emoji.info} Whitespaces: \`${stats.whitespaces.toLocaleString()}\`\n`,
        `**Statistics**`,
        `${client.emoji.info} Avg Lines/File: \`${Math.floor(stats.lines / stats.files)}\``,
        `${client.emoji.info} Total Size: \`${(stats.characters / 1024 / 1024).toFixed(2)} MB\``,
      ];

      const embeds = [client.embed().desc(info.join("\n"))];

      const treeChunks = _.chunk(stats.tree, 20);
      let pageNum = 2;
      for (const chunk of treeChunks) {
        embeds.push(
          client.embed().desc(`\`\`\`bash\n${chunk.join("\n")}\n\`\`\``),
        );
        pageNum++;
      }

      await paginator(ctx, embeds);
      await msg.delete().catch(() => {});
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
