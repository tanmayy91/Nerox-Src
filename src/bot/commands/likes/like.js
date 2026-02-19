import { Command } from "../../structures/abstract/command.js";

export default class Like extends Command {
  constructor() {
    super(...arguments);
    this.player = true;
    this.playing = true;
    this.description = "Like the currently playing song";
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

    // Check if song is already liked
    const isLiked = likedSongs.some((song) => song.uri === track.uri);

    if (isLiked) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.info} **Already Liked!**\n\n` +
                `${client.emoji.info1} \`${track.title}\` is already in your liked songs!`,
            ),
        ],
      });
      return;
    }

    // Add song to liked songs
    likedSongs.push({
      title: track.title,
      uri: track.uri,
      author: track.author,
      length: track.length,
      thumbnail: track.thumbnail,
      likedAt: Date.now(),
    });

    await client.db.likedSongs.set(ctx.author.id, likedSongs);

    await ctx.reply({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.check} **Song Liked!**\n\n` +
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
