/** @format
 * Neptune by Tanmay
 * Version: 2.0.1 (Beta)
 * © 2024 Neptune Headquarters
 */

import { Command } from "../../structures/abstract/command.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export default class Avatar extends Command {
  constructor() {
    super(...arguments);
    this.aliases = ["av", "avatar", "img"];
    this.description = "Displays the user/server avatar with buttons";
    this.usage = "[user]";
  }

  execute = async (client, ctx) => {
    const target = ctx.mentions.users.first() || ctx.author;
    const member = ctx.guild?.members.cache.get(target.id);

    const userAvatar = target.displayAvatarURL({ dynamic: true, size: 4096 });
    const serverAvatar = member?.avatar
      ? member.displayAvatarURL({ dynamic: true, size: 4096 })
      : null;

    // Send embed with default: user avatar
    const embed = client
      .embed()
      .title(`${target.username}'s Avatar`)
      .img(userAvatar)
      .desc(`[Open in browser](${userAvatar})`);

    // Buttons if server avatar is available and different
    if (serverAvatar && userAvatar !== serverAvatar) {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("user_avatar")
          .setLabel("User Avatar")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId("server_avatar")
          .setLabel("Server Avatar")
          .setStyle(ButtonStyle.Secondary),
      );

      const msg = await ctx.reply({ embeds: [embed], components: [row] });

      const collector = msg.createMessageComponentCollector({
        filter: (i) => i.user.id === ctx.author.id,
        time: 15000,
      });

      collector.on("collect", async (interaction) => {
        const type = interaction.customId;
        if (type === "user_avatar") {
          await interaction.update({
            embeds: [
              client
                .embed()
                .title(`${target.username}'s Avatar`)
                .img(userAvatar)
                .desc(`[Open in browser](${userAvatar})`),
            ],
          });
        } else if (type === "server_avatar") {
          await interaction.update({
            embeds: [
              client
                .embed()
                .title(`${target.username}'s Server Avatar`)
                .img(serverAvatar)
                .desc(`[Open in browser](${serverAvatar})`),
            ],
          });
        }
      });

      collector.on("end", () => {
        msg.edit({ components: [] }).catch(() => {});
      });
    } else {
      // No server avatar or same image
      await ctx.reply({ embeds: [embed] });
    }
  };
}
