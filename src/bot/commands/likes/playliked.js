import { Command } from "../../structures/abstract/command.js";
import { getPrefix } from "../../../lib/utils/getPrefix.js";

export default class PlayLiked extends Command {
  constructor() {
    super(...arguments);
    this.inSameVC = true;
    this.aliases = ["pl"];
    this.description = "Play all your liked songs";
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

    const player =
      client.getPlayer(ctx) ||
      (await client.manager.createPlayer({
        deaf: true,
        guildId: ctx.guild.id,
        textId: ctx.channel.id,
        shardId: ctx.guild.shardId,
        voiceId: ctx.member.voice.channel.id,
      }));

    const waitEmbed = await ctx.reply({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.timer} Loading your liked songs...\n\n` +
              `${client.emoji.info1} Total songs: **${likedSongs.length}**`,
          ),
      ],
    });

    let addedCount = 0;
    let failedCount = 0;

    for (const song of likedSongs) {
      try {
        const result = await player.search(song.uri, {
          requester: ctx.author,
        });

        if (result.tracks.length > 0) {
          player.queue.add(result.tracks[0]);
          addedCount++;
        } else {
          failedCount++;
        }
      } catch (error) {
        failedCount++;
      }
    }

    if (addedCount === 0) {
      await waitEmbed.edit({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} **Failed to load songs!**\n\n` +
                `${client.emoji.info1} Could not find any of your liked songs.`,
            ),
        ],
      });
      return;
    }

    if (!player.playing && !player.paused) {
      player.play();
    }

    let description = `${client.emoji.check} **Liked Songs Added to Queue!**\n\n`;
    description += `${client.emoji.info} **Successfully added:** ${addedCount} songs\n`;

    if (failedCount > 0) {
      description += `${client.emoji.cross} **Failed to add:** ${failedCount} songs\n`;
    }

    description += `\n${client.emoji.info1} Use \`${prefix}queue\` to view the queue!`;

    await waitEmbed.edit({
      embeds: [client.embed().desc(description)],
    });
  };
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
