import { Command } from "../../structures/abstract/command.js";

export default class Redeem extends Command {
  constructor() {
    super(...arguments);
    this.aliases = ["redeemcode", "rc"];
    this.description = "Redeem a premium code";

    this.options = [
      {
        name: "code",
        opType: "string",
        required: true,
        description: "The premium code to redeem",
      },
    ];

    this.execute = async (client, ctx, args) => {
      const code = args[0]?.toUpperCase();
      if (!code) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(`${client.emoji.cross} Please provide a redeem code.`),
          ],
        });
      }

      const data = await client.db.redeemCode.get(code);
      if (!data) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(`${client.emoji.cross} Invalid or unknown redeem code.`),
          ],
        });
      }

      if (data.redeemed) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.cross} This code has already been redeemed.`,
              ),
          ],
        });
      }

      if (Date.now() > data.expiresAt) {
        return ctx.reply({
          embeds: [
            client.embed().desc(`${client.emoji.cross} This code has expired.`),
          ],
        });
      }

      const generatorTag = await client.users
        .fetch(data.generatedBy)
        .then((u) => `${u.tag} (${u.id})`)
        .catch(() => `Unknown (${data.generatedBy})`);

      if (data.type === "user") {
        const existing = await client.db.botstaff.get(ctx.author.id);
        if (existing && existing.expiresAt > Date.now()) {
          return ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${client.emoji.cross} You already have premium access.`),
            ],
          });
        }

        await client.db.botstaff.set(ctx.author.id, {
          expiresAt: Date.now() + data.duration * 86400000,
          redeemedAt: Date.now(),
          codeUsed: code,
        });

        await client.db.redeemCode.set(code, {
          ...data,
          redeemed: true,
          redeemedBy: ctx.author.id,
          redeemedAt: Date.now(),
        });

        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.check} Premium activated successfully!\n\n` +
                  `${client.emoji.info1} **Type**: User\n` +
                  `${client.emoji.info1} **Duration**: \`${data.duration} day(s)\`\n` +
                  `${client.emoji.info1} **Activated by**: ${ctx.author.tag} (${ctx.author.id})\n` +
                  `${client.emoji.info1} **Code Generator**: ${generatorTag}`,
              ),
          ],
        });
      }

      if (data.type === "guild") {
        const existing = await client.db.serverstaff.get(ctx.guild.id);
        if (existing && existing.expiresAt > Date.now()) {
          return ctx.reply({
            embeds: [
              client
                .embed()
                .desc(
                  `${client.emoji.cross} This server already has premium access.`,
                ),
            ],
          });
        }

        await client.db.serverstaff.set(ctx.guild.id, {
          expiresAt: Date.now() + data.duration * 86400000,
          redeemedAt: Date.now(),
          codeUsed: code,
        });

        await client.db.redeemCode.set(code, {
          ...data,
          redeemed: true,
          redeemedBy: ctx.author.id,
          redeemedAt: Date.now(),
        });

        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.check} Premium activated successfully!\n\n` +
                  `${client.emoji.info1} **Type**: Guild\n` +
                  `${client.emoji.info1} **Duration**: \`${data.duration} day(s)\`\n` +
                  `${client.emoji.info1} **Activated by**: ${ctx.author.tag} (${ctx.author.id})\n` +
                  `${client.emoji.info1} **Code Generator**: ${generatorTag}`,
              ),
          ],
        });
      }
    };
  }
}
