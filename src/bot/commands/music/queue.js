import _ from "lodash";
import { paginator } from "../../../lib/utils/paginator.js";
import { Command } from "../../structures/abstract/command.js";

export default class Queue extends Command {
  constructor() {
    super(...arguments);
    this.playing = true;
    this.inSameVC = true;
    this.aliases = ["q"];
    this.description = "Get player queue";
    this.execute = async (client, ctx) => {
      const player = client.getPlayer(ctx);
      const current = player.queue.current;
      const previous = player.queue.previous;
      const upcoming = [...player.queue];

      const totalDuration =
        upcoming.reduce((acc, t) => acc + (t.length || 0), 0) +
        (current?.length || 0);
      const totalTracks = previous.length + 1 + upcoming.length;

      const formatTrack = (
        track,
        index,
        isCurrent = false,
        isPrevious = false,
      ) => {
        const duration = track.isStream
          ? "LIVE"
          : client.formatDuration(track.length);
        const title =
          track.title.length > 38
            ? track.title.substring(0, 35) + "..."
            : track.title;

        if (isCurrent) {
          return `${client.emoji.resume} **${index + 1}. ${title}**\n\`${duration}\``;
        }
        if (isPrevious) {
          return `~~${index + 1}. ${title}~~\n\`${duration}\``;
        }
        return `${client.emoji.info1} ${index + 1}. ${title}\n\`${duration}\``;
      };

      // Build queue list
      const queueList = [];

      // Previous tracks
      previous.forEach((track, i) => {
        queueList.push(formatTrack(track, i, false, true));
      });

      // Current track
      if (current) {
        queueList.push(formatTrack(current, previous.length, true));
      }

      // Upcoming tracks
      upcoming.forEach((track, i) => {
        queueList.push(formatTrack(track, previous.length + 1 + i));
      });

      const chunked = _.chunk(queueList, 10);
      const pages = chunked.map((chunk, pageIndex) =>
        client
          .embed()
          .setAuthor({
            name: "Queue",
            iconURL: client.user.displayAvatarURL(),
          })
          .setThumbnail(current?.thumbnail || client.user.displayAvatarURL())
          .desc(
            `\`${totalTracks} tracks\` • \`${client.formatDuration(totalDuration)}\`\n\n` +
              chunk.join("\n") +
              `\n\n\`\`\`\n` +
              `Loop: ${player.loop || "Off"} • Volume: ${player.volume}%\n` +
              `\`\`\``,
          ),
      );

      await paginator(ctx, pages, Math.floor(previous.length / 8) || 0);
    };
  }
}
