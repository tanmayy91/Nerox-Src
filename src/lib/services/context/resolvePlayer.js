export const resolvePlayer = async (ctx, command) => {
  const { client } = ctx;
  if (!(command.playing || command.player)) return true;
  const player = client.getPlayer(ctx);
  if (!player) {
    await ctx.reply({
      embeds: [
        client
          .embed()
          .desc(`${client.emoji.cross} There is no player for this guild.`),
      ],
    });
    return false;
  }
  if (command.playing && !player.queue.current) {
    await ctx.reply({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.cross} There is no playing player for this guild.`,
          ),
      ],
    });
    return false;
  }
  return true;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
