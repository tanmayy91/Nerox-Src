import { Command } from "../../structures/abstract/command.js";

export default class NowPlaying extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.aliases = ["now", "np"];
    this.description = "Get current song info";
    this.execute = async (client, ctx) => {
      const player = client.getPlayer(ctx);
      const track = player.queue.current;
      const position = player.position;
      const duration = track.length || 0;

      // Create progress bar (handle live streams with 0 duration)
      const progress =
        duration > 0 ? Math.round((position / duration) * 20) : 0;
      const progressBar = track.isStream
        ? "LIVE"
        : "▰".repeat(progress) + "▱".repeat(20 - progress);

      const displayTitle =
        track.title.length > 50
          ? track.title.substring(0, 47) + "..."
          : track.title;

      await ctx.reply({
        embeds: [
          client
            .embed()
            .setAuthor({
              name: "Now Playing",
              iconURL: client.user.displayAvatarURL(),
            })
            .setThumbnail(track.thumbnail || client.user.displayAvatarURL())
            .desc(
              `**${displayTitle}**\n` +
                `${track.author}\n\n` +
                `${progressBar}\n` +
                `\`${client.formatDuration(position)}\` / \`${track.isStream ? "LIVE" : client.formatDuration(duration)}\`\n\n` +
                `Requested by ${track.requester.displayName}`,
            ),
        ],
      });
    };
  }
}
