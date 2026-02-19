export const createContext = async (client, message) => {
  if (
    !message.guild ||
    !message.member ||
    !message.channel ||
    message.channel.isDMBased()
  )
    return;
  const _mentions = {
    everyone: message.mentions.everyone,
  };
  if (message.mentions.users?.size) _mentions.users = message.mentions.users;
  if (message.mentions.roles?.size) _mentions.roles = message.mentions.roles;
  if (message.mentions.members?.size)
    _mentions.members = message.mentions.members;
  if (message.mentions.channels?.size)
    _mentions.channels = message.mentions.channels;
  const _attachments = message.attachments.size
    ? message.attachments
    : undefined;
  const ctx = {
    id: message.id,
    client: client,
    message: message,
    mentions: _mentions,
    guild: message.guild,
    member: message.member,
    author: message.author,
    channel: message.channel,
    content: message.content,
    guildId: message.guild.id,
    attachments: _attachments,
    channelId: message.channel.id,
    react: async (e, c) => {
      if (c) await message.reply(c);
      return await message.react(e);
    },
    createdTimestamp: message.createdTimestamp,
    reply: async (args) => await message.reply(args),
    send: async (args) => {
      const channel = message.channel;
      if (channel && "send" in channel) {
        return await channel.send(args);
      }
      throw new Error("The channel does not support sending messages.");
    },
  };
  return ctx;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
