import { Command } from "../../structures/abstract/command.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getPrefix } from "../../../lib/utils/getPrefix.js";

export default class ShowLiked extends Command {
  constructor() {
    super(...arguments);
    this.aliases = ["likedlist", "ll"];
    this.description = "Show your liked songs";
  }

  execute = async (client, ctx) => {
    const prefix = await getPrefix(client, ctx.guild.id);
    const likedSongs = (await client.db.likedSongs.get(ctx.author.id)) || [];

    if (likedSongs.length === 0) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} **No Liked Songs!**\n\n` +
                `${client.emoji.info1} Use \`${prefix}like\` while a song is playing to add it to your liked songs!`,
            ),
        ],
      });
      return;
    }

    const itemsPerPage = 10;
    const totalPages = Math.ceil(likedSongs.length / itemsPerPage);
    let currentPage = 0;

    const generateEmbed = (page) => {
      const start = page * itemsPerPage;
      const end = start + itemsPerPage;
      const pageSongs = likedSongs.slice(start, end);

      let description = `${client.emoji.info} **Your Liked Songs** (${likedSongs.length} total)\n\n`;

      pageSongs.forEach((song, index) => {
        const position = start + index + 1;
        const duration = client.formatDuration(song.length);
        description += `**${position}.** \`${song.title}\` by \`${song.author}\` - \`${duration}\`\n`;
      });

      description += `\n${client.emoji.info1} Page ${page + 1} of ${totalPages}`;

      return client.embed().desc(description);
    };

    const generateButtons = (page) => {
      const row = new ActionRowBuilder();

      row.addComponents(
        new ButtonBuilder()
          .setCustomId("first")
          .setEmoji("⏮️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
      );

      row.addComponents(
        new ButtonBuilder()
          .setCustomId("prev")
          .setEmoji("◀️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
      );

      row.addComponents(
        new ButtonBuilder()
          .setCustomId("next")
          .setEmoji("▶️")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === totalPages - 1),
      );

      row.addComponents(
        new ButtonBuilder()
          .setCustomId("last")
          .setEmoji("⏭️")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1),
      );

      return row;
    };

    const message = await ctx.reply({
      embeds: [generateEmbed(currentPage)],
      components: totalPages > 1 ? [generateButtons(currentPage)] : [],
    });

    if (totalPages <= 1) return;

    const collector = message.createMessageComponentCollector({
      filter: (i) => i.user.id === ctx.author.id,
      time: 120000, // 2 minutes
    });

    collector.on("collect", async (interaction) => {
      if (interaction.customId === "first") {
        currentPage = 0;
      } else if (interaction.customId === "prev") {
        currentPage = Math.max(0, currentPage - 1);
      } else if (interaction.customId === "next") {
        currentPage = Math.min(totalPages - 1, currentPage + 1);
      } else if (interaction.customId === "last") {
        currentPage = totalPages - 1;
      }

      await interaction.update({
        embeds: [generateEmbed(currentPage)],
        components: [generateButtons(currentPage)],
      });
    });

    collector.on("end", async () => {
      try {
        await message.edit({ components: [] });
      } catch (error) {
        // Message might have been deleted
      }
    });
  };
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
