/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */
import _ from "lodash";
import { paginator } from "../../../lib/utils/paginator.js";
import { Command } from "../../structures/abstract/command.js";

export default class ModManage extends Command {
  constructor() {
    super(...arguments);
    this.admin = true; // Only Admins & Owners can use
    this.aliases = ["mod"];
    this.description = "Add / remove bot moderators";
    this.options = [
      {
        name: "action",
        opType: "string",
        description: "Add / remove mod",
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
        description: "User to add / remove as mod",
      },
    ];

    this.execute = async (client, ctx, args) => {
      if (!["add", "remove", "list"].includes(args[0]?.toLowerCase())) {
        ctx.reply({
          embeds: [
            client
              .embed()
              .desc(`${client.emoji.cross} Please specify a valid action.`),
          ],
        });
        return;
      }

      if (args[0].toLowerCase() === "list") {
        const keys = await ctx.client.db.botmods.keys;
        if (!keys.length) {
          ctx.reply({
            embeds: [
              client.embed().desc(`${client.emoji.cross} No moderators found.`),
            ],
          });
          return;
        }
        const users = await Promise.all(
          keys.map(
            async (user) =>
              await client.users.fetch(user).catch(async (err) => {
                try {
                  await client.db.botmods.delete(user);
                } catch (deleteErr) {
                  console.error("Failed to delete invalid mod entry:", deleteErr);
                }
                return null;
              }),
          ),
        );
        const modUsers = users
          .filter((user) => user)
          .map(
            (user, index) => `${index + 1} **${user?.tag}** \`[${user?.id}]\``,
          );
        const chunked = _.chunk(modUsers, 10);
        const embeds = chunked.map((chunk) =>
          client
            .embed()
            .setTitle(`${client.emoji.check} Bot Moderators`)
            .desc(chunk.join("\n")),
        );
        await paginator(ctx, embeds);
        return;
      }

      const target = ctx.mentions.users?.first()?.id
        ? ctx.mentions.users?.first()
        : await client.users.fetch(args[1]).catch(() => {});
      if (!target) {
        ctx.reply({
          embeds: [
            client
              .embed()
              .desc(`${client.emoji.cross} Please specify a valid user.`),
          ],
        });
        return;
      }

      const status = await ctx.client.db.botmods.get(target.id);
      switch (args[0].toLowerCase()) {
        case "add":
          if (status) {
            ctx.reply({
              embeds: [
                client
                  .embed()
                  .desc(
                    `${client.emoji.cross} User is already a bot moderator.`,
                  ),
              ],
            });
            return;
          }
          await ctx.client.db.botmods.set(target.id, true);
          await ctx.reply({
            embeds: [
              client
                .embed()
                .desc(
                  `${client.emoji.check} Successfully added \`${target.tag}\` as a bot moderator.`,
                ),
            ],
          });
          break;
        case "remove":
          if (!status) {
            ctx.reply({
              embeds: [
                client
                  .embed()
                  .desc(`${client.emoji.cross} User is not a bot moderator.`),
              ],
            });
            return;
          }
          await ctx.client.db.botmods.delete(target.id);
          await ctx.reply({
            embeds: [
              client
                .embed()
                .desc(
                  `${client.emoji.check} Successfully removed \`${target.tag}\` from bot moderators.`,
                ),
            ],
          });
          break;
      }
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
