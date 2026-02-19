import { filter } from "./filter.js";
import { ActionRowBuilder } from "discord.js";
export const paginator = async (ctx, pages, pageToSend = 0) => {
  const client = ctx.client;
  if (pages.length === 1) {
    await ctx?.reply({
      embeds: [pages[0]],
    });
    return;
  }
  let page = pageToSend;
  const reply = await ctx?.reply({
    embeds: [pages[page]],
    components: [
      new ActionRowBuilder().addComponents(
        client.button().secondary("back", "Previous"),
        client.button().secondary("home", "Home"),
        client.button().secondary("next", "Next"),
        client.button().danger("end", "Close"),
      ),
    ],
  });
  if (!reply) return;
  const collector = reply.createMessageComponentCollector({
    idle: 30000,
    filter: async (interaction) => await filter(interaction, ctx),
  });
  collector.on("collect", async (interaction) => {
    await interaction.deferUpdate();
    switch (interaction.customId) {
      case "home":
        page = 0;
        break;
      case "back":
        page = page > 0 ? --page : pages.length - 1;
        break;
      case "next":
        page = page + 1 < pages.length ? ++page : 0;
        break;
      case "end":
        collector.stop();
        break;
    }
    await reply.edit({
      embeds: [pages[page]],
    });
  });
  collector.on("end", () => {
    reply
      .edit({
        components: [],
      })
      .catch(() => null);
  });
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
