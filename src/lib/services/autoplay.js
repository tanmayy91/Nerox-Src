export const autoplay = async (client, player) => {
  await player.data
    .get("playEmbed")
    ?.delete()
    .catch(() => null);
  const currentTrack = player.data.get("autoplayFromTrack");
  const regex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const identifier = currentTrack.realUri?.match(regex)?.[1];
  const query = identifier
    ? `https://www.youtube.com/watch?v=${identifier}&list=RD${identifier}`
    : currentTrack.author;
  const result = await player.search(query, {
    requester: client.user,
  });
  const channel = client.channels.cache.get(player.textId);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    await player.destroy();
    return;
  }
  if (!result.tracks.length) {
    await channel.send({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.warn} Autoplay ended.\n` +
              `${client.emoji.info} No similar tracks were found.`,
          ),
      ],
    });
    await player.destroy();
    return;
  }
  const track =
    result.tracks[
      Math.floor(
        Math.random() * (Math.min(result.tracks.length - 1, 5) + 1) + 1,
      )
    ];
  player?.queue.add(track);
  await player?.play();
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
