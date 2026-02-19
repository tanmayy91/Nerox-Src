export const connect247 = async (client, guildId) => {
  if (client.getPlayer({ guild: { id: guildId } })) return false;
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return (await client.db.twoFourSeven.delete(guildId), false);
  const data = await client.db.twoFourSeven.get(guild.id);
  const textChannel = guild.channels.cache.get(data.textId);
  const voiceChannel = guild.channels.cache.get(data.voiceId);
  if (!(textChannel?.isTextBased() && voiceChannel?.isVoiceBased()))
    return (await client.db.twoFourSeven.delete(guild.id), false);
  await client.manager.createPlayer({
    deaf: true,
    guildId: guild.id,
    textId: textChannel.id,
    shardId: guild.shardId,
    voiceId: voiceChannel.id,
  });
  await textChannel
    .send({
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.info} A 24/7 player has been successfully created in <#${voiceChannel.id}> and linked to <#${textChannel.id}>.`,
          ),
      ],
    })
    .then(async (message) => {
      await client.sleep(5);
      await message.delete().catch(() => {}); // Ignore delete errors
    })
    .catch((err) => {
      console.error("Failed to send 247 connection message:", err);
    });
  return true;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
