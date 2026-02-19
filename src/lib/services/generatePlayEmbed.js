export const generatePlayEmbed = (client, player) => {
  const track = player.queue.current;
  if (!track)
    return client.embed().desc(`${client.emoji.error} No track details`);

  const { title, author, requester } = track;
  const duration = track.isStream
    ? `LIVE`
    : client.formatDuration(track.length || 369);
  const displayTitle =
    title.length > 45 ? title.substring(0, 42) + "..." : title;
  const displayAuthor =
    author.length > 40 ? author.substring(0, 37) + "..." : author;

  const embed = client
    .embed()
    .setTitle("🎵 Now Playing")
    .desc(
      `**${displayTitle}**\n` +
        `By ${displayAuthor}\n\n` +
        `\`\`\`\n` +
        `Duration: ${duration}\n` +
        `Queue: ${player.queue.size} tracks\n` +
        `Volume: ${player.volume}%\n` +
        `\`\`\`\n` +
        `Requested by ${requester?.displayName || "Unknown"}`,
    );

  return embed;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
