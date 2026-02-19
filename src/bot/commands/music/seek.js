import { filter } from "../../../lib/utils/filter.js";
import { toMs } from "../../../lib/services/ms/toMs.js";
import { fromMs } from "../../../lib/services/ms/fromMs.js";
import { progressBar } from "../../../lib/utils/progressbar.js";
import { Command } from "../../structures/abstract/command.js";
import { ActionRowBuilder } from "discord.js";
export default class Seek extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.usage = "[duration]";
    this.description = "seek song";
    this.options = [
      {
        required: false,
        name: "duration",
        opType: "string",
        description: "time duration to seek to",
      },
    ];
    this.execute = async (client, ctx, args) => {
      const player = client.getPlayer(ctx);
      const track = player.queue.current;
      if (track.isStream) {
        await ctx.reply({
          embeds: [
            client.embed().desc(`${client.emoji.cross} Track is not seekable.`),
          ],
        });
        return;
      }
      if (args.length) {
        const seekTo = toMs(args.join(" ")) || 0;
        const total = player.queue.current.length;
        if (seekTo > total || seekTo < 0) {
          await ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${client.emoji.cross} Please provide a valid duration.`),
            ],
          });
          return;
        }
        await player.seek(seekTo);
        {
          await ctx.reply({
            embeds: [
              client
                .embed()
                .desc(`${client.emoji.check} Seeked to ${fromMs(seekTo)}.`),
            ],
          });
          return;
        }
      }
      const generateEmbed = () => {
        const _player = client.getPlayer(ctx);
        if (!_player) return client.embed().desc(`Player not found.`);
        return client
          .embed()
          .desc(
            progressBar(_player.position, _player.queue.current.length, 25),
          );
      };
      const reply = await ctx.reply({
        embeds: [generateEmbed()],
        components: [
          new ActionRowBuilder().addComponents(
            client.button().secondary("-30s", "- 30", ``, false),
            client.button().secondary("-10s", "- 10", ``, false),
            client.button().secondary("+10s", "+ 10", ``, false),
            client.button().secondary("+30s", "+ 30", ``, false),
          ),
        ],
      });
      const collector = reply.createMessageComponentCollector({
        idle: 10000,
        filter: async (interaction) => await filter(interaction, ctx),
      });
      collector.on("collect", async (interaction) => {
        await interaction.deferUpdate();
        let time = 0;
        const player = client.getPlayer(ctx);
        if (!player?.queue.current) return;
        const position = player.position;
        const total = player.queue.current.length;
        switch (interaction.customId) {
          case "-30s":
            time = position - 30000;
            if (time < 0) time = 0;
            await player.seek(time);
            await interaction.message.edit({ embeds: [generateEmbed()] });
            break;
          case "-10s":
            time = position - 10000;
            if (time < 0) time = 0;
            await player.seek(time);
            await interaction.message.edit({ embeds: [generateEmbed()] });
            break;
          case "+10s":
            time = position + 10000;
            if (time > total) {
              await interaction.followUp({
                embeds: [
                  client
                    .embed()
                    .desc(`${client.emoji.cross} Cant seek any further.`),
                ],
                ephemeral: true,
              });
              break;
            }
            await player.seek(time);
            await interaction.message.edit({ embeds: [generateEmbed()] });
            break;
          case "+30s":
            time = player.position + 30000;
            if (time > total) {
              await interaction.followUp({
                embeds: [
                  client
                    .embed()
                    .desc(`${client.emoji.cross} Cant seek any further.`),
                ],
                ephemeral: true,
              });
              break;
            }
            await player.seek(time);
            await interaction.message.edit({ embeds: [generateEmbed()] });
            break;
        }
      });
      collector.on("end", async () => {
        const embed = { ...reply?.embeds[0].data };
        embed.footer = {
          text: "Seek command timed out !",
        };
        await reply.edit({
          embeds: [embed],
          components: [],
        });
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
