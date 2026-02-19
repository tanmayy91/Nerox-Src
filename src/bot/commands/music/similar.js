/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */
import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { filter } from "../../../lib/utils/filter.js";
import { Command } from "../../structures/abstract/command.js";
export default class Similar extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.description = "Get songs similar to current";
    this.execute = async (client, ctx) => {
      const player = client.getPlayer(ctx);
      const waitEmbed = await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.timer} Please wait while I'm searching for similar songs.`,
            ),
        ],
      });
      const regex =
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
      const identifier = player.queue.current.realUri?.match(regex)?.[1];
      const query = identifier
        ? `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`
        : player.queue.current.author;
      const result = await player.search(query, {
        engine: "youtube",
        requester: ctx.author,
      });
      const tracks = result.tracks.slice(0, 29);
      if (!tracks.length) {
        await waitEmbed.edit({
          embeds: [
            client.embed().desc(`${client.emoji.cross} No results found.`),
          ],
        });
        return;
      }
      const options = tracks.map((track, index) => {
        const title = track.title || "Unknown Track";
        const author = track.author || "Unknown Artist";
        return {
          label: `${index} - ${title.charAt(0).toUpperCase() + title.substring(1, 30)}`,
          value: `${index}`,
          description: `Author: ${author.substring(0, 30)}     Duration: ${track?.isStream ? "LIVE" : client.formatDuration(track.length)}`,
          emoji: client.emoji.info,
        };
      });
      const menu = new StringSelectMenuBuilder()
        .setMinValues(1)
        .setCustomId("menu")
        .addOptions(options)
        .setMaxValues(tracks.length - 1)
        .setPlaceholder("Similar songs");
      const reply = await waitEmbed.edit({
        embeds: [
          client.embed().desc(`${client.emoji.info} Select a track below.`),
        ],
        components: [new ActionRowBuilder().addComponents(menu)],
      });
      const collector = reply.createMessageComponentCollector({
        idle: 30000,
        filter: async (interaction) => await filter(interaction, ctx),
      });
      collector.on("collect", async (interaction) => {
        await interaction.deferUpdate();
        const desc = {
          added: [""],
          notAdded: [""],
        };
        for (const value of interaction.values) {
          const index = parseInt(value);
          if (isNaN(index) || index < 0 || index >= tracks.length) {
            desc.notAdded.push(`${client.emoji.cross} Invalid selection\n`);
            continue;
          }
          const song = tracks[index];
          if (!song || song.length < 10000) {
            desc.notAdded.push(`${client.emoji.cross} ${song?.title || "Unknown track"}\n`);
            continue;
          }
          player.queue.add(song);
          desc.added.push(`${client.emoji.check} ${song.title}\n`);
        }
        await reply.edit({
          embeds: [
            client.embed().desc(desc.added.join("") + desc.notAdded.join("")),
          ],
          components: [],
        });
        if (!player.playing && !player.paused) player.play();
      });
      collector.on("end", async (collected) => {
        if (collected.size) return;
        await reply.edit({
          embeds: [
            client
              .embed()
              .desc(`${client.emoji.warn} Track selection menu timed out !`),
          ],
          components: [],
        });
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
