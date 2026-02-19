import { Command } from "../../structures/abstract/command.js";
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";

export default class SearchEngine extends Command {
  constructor() {
    super(...arguments);
    this.aliases = ["se", "engine", "searchprovider"];
    this.usage = "";
    this.description = "Set your preferred search engine (Premium Only)";
    this.execute = async (client, ctx, args) => {
      const { prem, check, cross, info } = client.emoji;

      // Check if user is premium
      const isPremium = await client.db.botstaff.get(ctx.author.id);

      if (!isPremium) {
        return ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${cross} This is a **premium-only** feature!\n\n${prem} Upgrade to premium to customize your search engine and unlock exclusive features.`,
              )
              .setColor("#FFD700"),
          ],
        });
      }

      // Get current preference
      const userPrefs =
        (await client.db.userPreferences.get(ctx.author.id)) || {};
      const currentEngine = userPrefs.searchEngine || "youtube";

      const engineNames = {
        youtube: "YouTube",
        youtubemusic: "YouTube Music",
        spotify: "Spotify",
        soundcloud: "SoundCloud",
        applemusic: "Apple Music",
        deezer: "Deezer",
      };

      // Create select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("search_engine_select")
        .setPlaceholder("Select a search engine")
        .addOptions([
          {
            label: "YouTube",
            value: "youtube",
            description: "Default search engine",
            default: currentEngine === "youtube",
          },
          {
            label: "YouTube Music",
            value: "youtubemusic",
            description: "Music-focused YouTube",
            default: currentEngine === "youtubemusic",
          },
          {
            label: "Spotify",
            value: "spotify",
            description: "Search from Spotify",
            default: currentEngine === "spotify",
          },
          {
            label: "SoundCloud",
            value: "soundcloud",
            description: "Search from SoundCloud",
            default: currentEngine === "soundcloud",
          },
          {
            label: "Apple Music",
            value: "applemusic",
            description: "Search from Apple Music",
            default: currentEngine === "applemusic",
          },
          {
            label: "Deezer",
            value: "deezer",
            description: "Search from Deezer",
            default: currentEngine === "deezer",
          },
        ]);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const message = await ctx.reply({
        embeds: [
          client
            .embed()
            .setTitle("Search Engine Settings")
            .desc(
              `**Current Engine:** ${engineNames[currentEngine]}\n\n${info} Select your preferred search engine from the menu below.`,
            )
            .setColor("#FFD700"),
        ],
        components: [row],
      });

      // Create collector for the select menu
      const collector = message.createMessageComponentCollector({
        filter: (i) => i.user.id === ctx.author.id,
        time: 60000,
        max: 1,
      });

      collector.on("collect", async (interaction) => {
        const selectedEngine = interaction.values[0];

        // Update user preferences
        let userPrefs =
          (await client.db.userPreferences.get(ctx.author.id)) || {};
        userPrefs.searchEngine = selectedEngine;
        await client.db.userPreferences.set(ctx.author.id, userPrefs);

        await interaction.update({
          embeds: [
            client
              .embed()
              .desc(
                `${check} Search engine updated successfully!\n\n**New Default:** ${engineNames[selectedEngine]}\n\n${info} All your music searches will now use this engine by default.`,
              )
              .setColor("#00FF00"),
          ],
          components: [],
        });
      });

      collector.on("end", async (collected, reason) => {
        if (reason === "time" && collected.size === 0) {
          try {
            await message.edit({
              embeds: [
                client
                  .embed()
                  .desc(`${cross} Selection timed out. No changes were made.`)
                  .setColor("#FF0000"),
              ],
              components: [],
            });
          } catch (error) {
            // Message might be deleted
          }
        }
      });
    };
  }
}

/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
