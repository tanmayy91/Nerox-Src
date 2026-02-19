export const resolveNsfw = async (ctx, command) => {
  const { client } = ctx;
  if (!command.nsfw) return true;
  if (ctx.channel.isThread()) {
    await ctx.reply({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.cross} NSFW commands can't be used in threads.`,
          ),
      ],
    });
    return false;
  }
  if (!ctx.channel.nsfw) {
    await ctx.reply({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.cross} This command can only be used in a NSFW channel.`,
          ),
      ],
    });
    return false;
  }
  return true;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
