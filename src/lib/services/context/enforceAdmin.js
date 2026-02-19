export const enforceAdmin = async (ctx) => {
  const { client } = ctx;

  const requiredPerms = [
    "SendMessages",
    "EmbedLinks",
    "ViewChannel", // example perms — customize as needed
  ];

  const me = ctx.guild.members.me;
  const channelPerms = ctx.channel.permissionsFor(me);

  const missing = requiredPerms.filter((perm) => !channelPerms.has(perm));

  if (missing.length === 0) return true;

  await ctx.reply({
    embeds: [
      client
        .embed()
        .desc(
          `${client.emoji.cross} Seriously? I’m missing some basic permissions here: \`${missing.join(", ")}\`.\n\n` +
            `${client.emoji.info} My owner didn’t even bother giving me the right tools. And now? I’m just a glorified spectator. ` +
            `Tell them to stop slacking and fix my perms. Chop-chop.`,
        ),
    ],
  });

  return false;
};
