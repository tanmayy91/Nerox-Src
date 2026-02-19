export const resolvePerms = {
  basic: async (ctx) => {
    return ctx.guild.members.me
      .permissionsIn(ctx.channel)
      ?.has(
        ["ViewChannel", "ReadMessageHistory", "SendMessages", "EmbedLinks"],
        true,
      );
  },
  user: async (ctx, command, botAdmin) => {
    if (!command.userPerms.length) return true;
    const missingUserPermissions = ctx.member
      ?.permissionsIn(ctx.channel)
      .missing([...command.userPerms], true);
    if (!botAdmin && missingUserPermissions?.length) {
      await ctx.reply({
        embeds: [
          ctx.client
            .embed()
            .desc(
              `${ctx.client.emoji.cross} You need ${missingUserPermissions.join(", ")} permission(s) to execute the command ${command.name}.`,
            ),
        ],
      });
      return false;
    }
    return true;
  },
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
