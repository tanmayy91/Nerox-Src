/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */
import { Command } from "../../structures/abstract/command.js";
export default class Enhance extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.description = "Enhances audio quality";
    this.execute = async (client, ctx) => {
      const waitEmbed = await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.timer} **Initiating audio enhancement...** Standby while I calibrate your experience.`,
            ),
        ],
      });

      let bitrate = 96000;
      const rtcRegion = "brazil";

      switch (ctx.guild.premiumTier) {
        case 1:
          bitrate = 128000;
          break;
        case 2:
          bitrate = 256000;
          break;
        case 3:
          bitrate = 384000;
          break;
      }

      // First edit: Starting the process
      await waitEmbed.edit({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.timer} **Engaging core audio systems...** Perfecting your VC and player for optimal sound.`,
            ),
        ],
      });
      await client.sleep(2);

      // Second edit: Calibrating
      await waitEmbed.edit({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.timer} **Calibrating sound signatures...** Optimizing settings for a richer experience.`,
            ),
        ],
      });
      await client.sleep(2);

      // Third edit: Analyzing
      await waitEmbed.edit({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.timer} **Analyzing voice channel and player configuration...** Ensuring maximum efficiency.`,
            ),
        ],
      });
      await client.sleep(2);

      // Fourth edit: Filtering and enhancing
      await waitEmbed.edit({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.timer} **Filtering and enhancing audio frequencies...** Preparing your sound for liftoff.`,
            ),
        ],
      });
      await client.sleep(2);

      // Fifth edit: Final check and enhancement
      await waitEmbed.edit({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.timer} **Finalizing audio enhancement...** The next step will be a sonic revolution.`,
            ),
        ],
      });
      await client.sleep(2);

      // Apply changes
      await Promise.all([
        client.getPlayer(ctx).shoukaku.setFilters({
          equalizer: [
            { band: 0, gain: 0.025 },
            { band: 1, gain: 0.03 },
            { band: 2, gain: 0.06 },
            { band: 3, gain: 0.01 },
            { band: 4, gain: 0.0625 },
            { band: 5, gain: 0.0125 },
            { band: 6, gain: -0.025 },
            { band: 7, gain: -0.05 },
            { band: 8, gain: -0.025 },
            { band: 9, gain: 0.01 },
            { band: 10, gain: 0.005 },
            { band: 11, gain: 0.0325 },
            { band: 12, gain: 0.05 },
            { band: 13, gain: 0.07 },
            { band: 14, gain: 0.04 },
          ],
        }),
        client.getPlayer(ctx).setVolume(80),
        ctx.member.voice.channel.edit({
          bitrate,
          rtcRegion,
        }),
        client.sleep(3),
      ]);

      // Final edit: The big reveal
      await waitEmbed.edit({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.check} **Audio enhancement complete!** Your audio has been upgraded to a whole new level.\n\n` +
                `${client.emoji.info} **VC Region:** \`${rtcRegion}\`\n` +
                `${client.emoji.info} **Audio Signature:** \`Harman 2019\`\n` +
                `${client.emoji.info} **Bitrate:** \`${bitrate / 1000}kbps\`\n` +
                `${client.emoji.check} Enjoy the enhanced sound quality and let your ears rejoice!`,
            ),
        ],
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
