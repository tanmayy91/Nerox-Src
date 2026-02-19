export const resolvePrefix = async (ctx, noPrefix) => {
  // Get guild-specific prefix if it exists
  const guildPrefix = await ctx.client.db.prefix.get(ctx.guild.id);
  const prefix = guildPrefix || ctx.client.prefix;

  return ctx.content.startsWith(prefix)
    ? prefix
    : ctx.content.startsWith(`<@${ctx.client.user.id}>`)
      ? `${ctx.client.user}`
      : noPrefix
        ? ""
        : null;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
