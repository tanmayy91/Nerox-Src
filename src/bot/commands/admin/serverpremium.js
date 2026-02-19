import ms from "ms";
import { Command } from "../../structures/abstract/command.js";

export default class PremiumServer extends Command {
  constructor() {
    super(...arguments);
    this.mod = true;
    this.aliases = ["ps", "premserver"];
    this.description = "Add / remove a server from the premium list";

    this.options = [
      {
        name: "action",
        opType: "string",
        description: "Add / remove server",
        required: true,
        choices: [
          { name: "add", value: "add" },
          { name: "remove", value: "remove" },
          { name: "list", value: "list" },
        ],
      },
      {
        name: "server_id",
        opType: "string",
        required: false,
        description: "Server ID to add/remove",
      },
      {
        name: "duration",
        opType: "string",
        required: false,
        description: "Duration for premium (e.g. 30d, 1y)",
      },
    ];

    this.execute = async (client, ctx, args) => {
      const { check, cross, info, info1, prem } = client.emoji;
      const action = args[0]?.toLowerCase();
      const serverId = args[1] || ctx.guild?.id;
      const durationArg = args[2];
      const durationMs = durationArg ? ms(durationArg) : null;
      const now = Date.now();

      if (!["add", "remove", "list"].includes(action)) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${cross} Please specify a valid action: \`add\`, \`remove\`, or \`list\`.`,
              ),
          ],
        });
      }

      if (action === "list") {
        const keys = await client.db.serverstaff.keys;
        if (!keys.length) {
          return ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${cross} No servers currently have premium access.`),
            ],
          });
        }

        const serverDetails = await Promise.all(
          keys.map(async (id, index) => {
            const data = await client.db.serverstaff.get(id);
            const server =
              client.guilds.cache.get(id) ||
              (await client.guilds.fetch(id).catch(() => null));
            const name = server?.name || "Unknown Server";
            const expires = data?.expires
              ? `<t:${Math.floor(data.expires / 1000)}:R>`
              : "`∞`";
            return `${index + 1}. **${name}** [\`${id}\`] — **Expires:** ${expires}`;
          }),
        );

        return ctx.reply({
          embeds: [
            client
              .embed()
              .setTitle(`${prem} Premium Servers`)
              .desc(serverDetails.join("\n")),
          ],
        });
      }

      if (!serverId) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${cross} Please provide a valid server ID or use this command in a server.`,
              ),
          ],
        });
      }

      const isPremium = await client.db.serverstaff.has(serverId);

      if (action === "add") {
        if (isPremium) {
          return ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${cross} This server already has premium access.`),
            ],
          });
        }

        const data = {
          addedBy: ctx.user.id,
          addedAt: now,
          ...(durationMs ? { expires: now + durationMs } : {}),
        };

        await client.db.serverstaff.set(serverId, data);

        return ctx.reply({
          embeds: [
            client
              .embed()
              .title(`${prem} Premium Activated`)
              .desc(
                `${check} Server \`${serverId}\` is now premium!\n\n${info1} **Activated By:** <@${ctx.user.id}>\n${info} **Expires:** ${durationMs ? `<t:${Math.floor((now + durationMs) / 1000)}:R>` : "`Never`"}`,
              ),
          ],
        });
      }

      if (action === "remove") {
        if (!isPremium) {
          return ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${cross} This server is not in the premium list.`),
            ],
          });
        }

        await client.db.serverstaff.delete(serverId);

        return ctx.reply({
          embeds: [
            client
              .embed()
              .title(`${prem} Premium Removed`)
              .desc(
                `${check} Server \`${serverId}\` has been removed from premium.`,
              ),
          ],
        });
      }
    };
  }
}
