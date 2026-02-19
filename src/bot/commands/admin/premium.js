import _ from "lodash";
import { paginator } from "../../../lib/utils/paginator.js";
import { Command } from "../../structures/abstract/command.js";

export default class StaffManage extends Command {
  constructor() {
    super(...arguments);
    this.mod = true;
    this.aliases = ["prem"];
    this.description = "Add / remove bot premium members";

    this.options = [
      {
        name: "action",
        opType: "string",
        description: "Add / remove premium or list all",
        required: true,
        choices: [
          { name: "add", value: "add" },
          { name: "remove", value: "remove" },
          { name: "list", value: "list" },
        ],
      },
      {
        name: "user",
        opType: "user",
        required: false,
        description: "User to add/remove as premium",
      },
      {
        name: "duration",
        opType: "integer",
        required: false,
        description: "Premium duration in days (for add)",
      },
    ];

    this.execute = async (client, ctx, args) => {
      const { prem, check, cross, info, info1 } = client.emoji;
      const action = args[0]?.toLowerCase();

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

      // list
      if (action === "list") {
        const keys = await client.db.botstaff.keys;
        if (!keys.length) {
          return ctx.reply({
            embeds: [
              client.embed().desc(`${cross} No premium subscribers found.`),
            ],
          });
        }

        const users = await Promise.all(
          keys.map(async (id) => {
            const data = await client.db.botstaff.get(id);
            const user = await client.users
              .fetch(id)
              .catch(() => client.db.botstaff.delete(id));
            return user ? { user, data } : null;
          }),
        );

        const list = users.filter(Boolean).map(({ user, data }, i) => {
          const days = Math.max(
            0,
            Math.floor((data.expiresAt - Date.now()) / 86400000),
          );
          return `${i + 1}. **${user.tag}** \`[${user.id}]\`\n${info1} \`${days}\` day(s) left | Added by: <@${data.addedBy}>`;
        });

        const pages = _.chunk(list, 6).map((chunk, i) =>
          client
            .embed()
            .setTitle(`${prem} Premium Subscribers`)
            .setFooter({ text: `Page ${i + 1}/${Math.ceil(list.length / 6)}` })
            .desc(chunk.join("\n\n")),
        );

        return paginator(ctx, pages);
      }

      // fetch user
      const userArg =
        ctx.mentions.users?.first() ||
        (await client.users.fetch(args[1]).catch(() => null));
      if (!userArg) {
        return ctx.reply({
          embeds: [
            client.embed().desc(`${cross} Please mention a valid user.`),
          ],
        });
      }

      const current = await client.db.botstaff.get(userArg.id);

      // add
      if (action === "add") {
        if (current) {
          return ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${info} \`${userArg.tag}\` already has premium.`),
            ],
          });
        }

        const duration = parseInt(args[2]);
        if (isNaN(duration) || duration < 1 || duration > 365) {
          return ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${info1} Please provide a valid duration (1-365 days).`),
            ],
          });
        }

        await client.db.botstaff.set(userArg.id, {
          expiresAt: Date.now() + duration * 86400000,
          redeemedAt: Date.now(),
          addedBy: ctx.author.id,
        });

        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${check} \`${userArg.tag}\` is now a premium user for \`${duration}\` day(s).`,
              ),
          ],
        });
      }

      // remove
      if (action === "remove") {
        if (!current) {
          return ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${info1} \`${userArg.tag}\` does not have premium.`),
            ],
          });
        }

        await client.db.botstaff.delete(userArg.id);

        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${check} Successfully removed \`${userArg.tag}\` from premium.`,
              ),
          ],
        });
      }
    };
  }
}
