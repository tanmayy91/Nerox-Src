import crypto from "crypto";
import { Command } from "../../structures/abstract/command.js";

export default class GenRedeem extends Command {
  constructor() {
    super(...arguments);
    this.aliases = ["genredeem", "genr"];
    this.description = "Generate a redeem code for user or guild premium";
    this.mod = true;

    this.options = [
      {
        name: "type",
        opType: "string",
        description: "Generate for user or guild?",
        required: true,
        choices: [
          { name: "User", value: "user" },
          { name: "Guild", value: "guild" },
        ],
      },
      {
        name: "duration",
        opType: "number",
        description: "Duration in days",
        required: true,
      },
    ];

    this.execute = async (client, ctx, args) => {
      const type = args[0]?.toLowerCase();
      const duration = parseInt(args[1]);

      if (!["user", "guild"].includes(type)) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.cross} Please specify a valid type: \`user\` or \`guild\`.`,
              ),
          ],
        });
      }

      if (isNaN(duration) || duration <= 0) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.cross} Duration must be a valid number greater than 0.`,
              ),
          ],
        });
      }

      const code = crypto.randomBytes(5).toString("hex").toUpperCase();
      const expiresAt = Date.now() + duration * 24 * 60 * 60 * 1000;

      await client.db.redeemCode.set(code, {
        type,
        duration,
        expiresAt,
        redeemed: false,
        generatedAt: Date.now(),
        generatedBy: ctx.author.id,
      });

      return ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.prem} **Redeem Code Generated**\n\n` +
                `${client.emoji.info1}**Code:** \`${code}\`\n` +
                `${client.emoji.info1}**Type:** \`${type.toUpperCase()}\`\n` +
                `${client.emoji.info1}**Duration:** \`${duration} day(s)\`\n\n` +
                `${client.emoji.info} Use \`${client.prefix}redeem ${code}\` to redeem.`,
            ),
        ],
      });
    };
  }
}
