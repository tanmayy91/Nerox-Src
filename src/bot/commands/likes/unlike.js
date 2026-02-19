import { Command } from "../../structures/abstract/command.js";

export default class Unlike extends Command {
  constructor() {
    super(...arguments);
    this.player = true;
    this.playing = true;
    this.description = "Unlike the currently playing song";
  }

  execute = async (client, ctx) => {
    const player = client.getPlayer(ctx);
    const track = player.queue.current;

    if (!track) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(`${client.emoji.cross} No track is currently playing!`),
        ],
      });
      return;
    }

    // Get user's liked songs
    const likedSongs = (await client.db.likedSongs.get(ctx.author.id)) || [];

    // Check if song is liked
    const songIndex = likedSongs.findIndex((song) => song.uri === track.uri);

    if (songIndex === -1) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} **Not Liked!**\n\n` +
                `${client.emoji.info1} \`${track.title}\` is not in your liked songs!`,
            ),
        ],
      });
      return;
    }

    // Remove song from liked songs
    likedSongs.splice(songIndex, 1);

    await client.db.likedSongs.set(ctx.author.id, likedSongs);

    await ctx.reply({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.check} **Song Unliked!**\n\n` +
              `${client.emoji.info} **Track:** \`${track.title}\`\n` +
              `${client.emoji.info} **Artist:** \`${track.author}\`\n\n` +
              `${client.emoji.info1} Total liked songs: **${likedSongs.length}**`,
          )
          .setThumbnail(track.thumbnail),
      ],
    });
  };
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
