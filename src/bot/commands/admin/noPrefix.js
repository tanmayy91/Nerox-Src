/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */
import _ from "lodash";
import { paginator } from "../../../lib/utils/paginator.js";
import { Command } from "../../structures/abstract/command.js";
export default class NoPrefix extends Command {
  constructor() {
    super(...arguments);
    this.mod = true;
    this.aliases = ["nop"];
    this.description = "Add / remove no prefix";
    this.options = [
      {
        name: "action",
        opType: "string",
        description: "Add / remove no prefix",
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
        description: "User to add / remove",
      },
    ];
    this.execute = async (client, ctx, args) => {
      if (
        !["add", "rem", "del", "remove", "list"].includes(
          args[0]?.toLowerCase(),
        )
      ) {
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
        const keys = await ctx.client.db.noPrefix.keys;
        if (!keys.length) {
          ctx.reply({
            embeds: [
              client
                .embed()
                .desc(
                  `${client.emoji.cross} There are no users with no prefix privilages.`,
                ),
            ],
          });
          return;
        }
        const promises = keys.map(
          async (user) =>
            await client.users.fetch(user).catch(async () => {
              await client.db.noPrefix.delete(user);
            }),
        );
        const users = await Promise.all(promises);
        const noPrefixUsers = users
          .filter((user) => user)
          .map(
            (user, index) => `${index + 1} **${user?.tag}** \`[${user?.id}]\``,
          );
        const chunked = _.chunk(noPrefixUsers, 10);
        const embeds = [];
        for (const chunk of chunked) {
          embeds.push(
            client
              .embed()
              .setTitle(`${client.emoji.check} No-Prefix user's list`)
              .desc(chunk.join("\n")),
          );
        }
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
      const status = await ctx.client.db.noPrefix.get(target.id);
      switch (args[0].toLowerCase()) {
        case "add":
          {
            if (status) {
              ctx.reply({
                embeds: [
                  client
                    .embed()
                    .desc(`${client.emoji.cross} User already has no prefix.`),
                ],
              });
              return;
            }
            await ctx.client.db.noPrefix.set(target.id, true);
            await ctx.reply({
              embeds: [
                client
                  .embed()
                  .desc(
                    `${client.emoji.check} Successfully added no prefix privilages to \`${target.tag}\`.`,
                  ),
              ],
            });
          }
          break;
        case "del":
        case "rem":
        case "remove":
          {
            if (!status) {
              ctx.reply({
                embeds: [
                  client
                    .embed()
                    .desc(
                      `${client.emoji.cross} User does not have no prefix.`,
                    ),
                ],
              });
              return;
            }
            await ctx.client.db.noPrefix.delete(target.id);
            await ctx.reply({
              embeds: [
                client
                  .embed()
                  .desc(
                    `${client.emoji.check} Successfully removed no prefix privilages from \`${target.tag}\`.`,
                  ),
              ],
            });
          }
          break;
      }
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
