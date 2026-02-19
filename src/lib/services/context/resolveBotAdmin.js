export const resolveBotAdmin = async (ctx, command) => {
  const { client, guild, channel, member } = ctx;

  // Fetch from DB & Client Configs
  const owner = client.owners.includes(ctx.author.id); // Bot Owners
  const admin = client.admins.includes(ctx.author.id); // Bot Admins
  const mod = await client.db.botmods.has(ctx.author.id); // Bot Mods
  const staff = await client.db.botstaff.has(ctx.author.id); // Bot Staff
  const serverStaff = guild ? await client.db.serverstaff.has(guild.id) : false; // Server Staff
  const isIgnored = await client.db.ignore.has(channel.id); // Ignored Channel Check
  const serverAdmin = member?.permissions.has("Administrator") || false; // Server Admin Check

  // If Channel is Ignored
  if (isIgnored) {
    const msg = await ctx.reply({
      content: `${client.emoji.cross} This channel is ignored from using my commands. Use them somewhere else.`,
    });
    setTimeout(() => msg.delete().catch(() => {}), 7000);
    return false;
  }

  // Owner-Only Command Check
  if (command.owner) {
    if (!owner) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} Only my Owners can use this command. You ain't one, so back off.`,
            ),
        ],
      });
      return false;
    }
    return true;
  }

  // Bot Admin-Only Command Check
  if (command.admin) {
    if (!admin) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} Only my Admins can use this. Get some real power first.`,
            ),
        ],
      });
      return false;
    }
    return true;
  }

  // Server Admin-Only Command Check
  if (command.serveradmin) {
    if (!serverAdmin) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} You ain't a Server Admin. Stop flexing and get real perms.`,
            ),
        ],
      });
      return false;
    }
    return true;
  }

  // Mod-Only Command Check
  if (command.mod) {
    if (!mod) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} Mods only. You ain't got the rank for this.`,
            ),
        ],
      });
      return false;
    }
    return true;
  }

  // Bot Staff-Only Command Check
  if (command.staff) {
    if (!staff) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} Premium users only. You? Nah, go touch some grass first.`,
            ),
        ],
      });
      return false;
    }
    return true;
  }

  // Server Staff-Only Command Check
  if (command.serverstaff) {
    if (!serverStaff) {
      await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              `${client.emoji.cross} Only VIP servers can use this. Yours ain't one.`,
            ),
        ],
      });
      return false;
    }
    return true;
  }

  return true; // Default true if no restrictions
};
