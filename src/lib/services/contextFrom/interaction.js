import { Collection } from "discord.js";
export const createContext = async (client, interaction) => {
  if (
    !interaction.user ||
    !interaction.guild ||
    !interaction.member ||
    !interaction.channel ||
    interaction.channel.isDMBased()
  )
    return;
  const mentions = {
    everyone: false,
    users: new Collection(),
    roles: new Collection(),
    channels: new Collection(),
    members: new Collection(),
  };
  const attachments = new Collection();
  for (const data of interaction.options.data) {
    if (data.user) {
      mentions.users.set(data.user.id, data.user);
      if (data.member) {
        const member = data.member;
        mentions.members.set(member.id, member);
      }
    } else if (data.role) {
      const role = data.role;
      mentions.roles.set(role.id, role);
      if (role.name === "@everyone") mentions.everyone = true;
    } else if (data.channel) {
      mentions.channels.set(data.channel.id, data.channel);
    } else if (data.attachment) {
      attachments.set(data.attachment.id, data.attachment);
    } else if (typeof data.value === "string") {
      if (data.value.includes("@everyone")) mentions.everyone = true;
    }
  }
  const _mentions = {
    everyone: mentions.everyone,
  };
  if (mentions.roles?.size) _mentions.roles = mentions.roles;
  if (mentions.users?.size) _mentions.users = mentions.users;
  if (mentions.members?.size) _mentions.members = mentions.members;
  if (mentions.channels?.size) _mentions.channels = mentions.channels;
  const _attachments = attachments.size ? attachments : undefined;
  const content = interaction.options.data
    .map((data) => data.attachment?.url || `${data.value}`)
    .join(" ");
  const ctx = {
    client: client,
    id: interaction.id,
    mentions: _mentions,
    interaction: interaction,
    guild: interaction.guild,
    author: interaction.user,
    attachments: _attachments,
    channel: interaction.channel,
    guildId: interaction.guild.id,
    channelId: interaction.channel.id,
    member: interaction.member,
    createdTimestamp: interaction.createdTimestamp,
    reply: async (args) => await interaction.editReply(args),
    content: `${client.prefix}${interaction.commandName} ${content}`,
    send: async (args) => {
      const channel = interaction.channel;
      if (channel && "send" in channel) {
        return await channel.send(args);
      }
      throw new Error("The channel does not support sending messages.");
    },
    react: async (emoji, content) => {
      const reply = await interaction.editReply({
        content: `${interaction.member} used the command : \`${interaction.commandName}\``,
      });
      const reaction = await reply.react(emoji);
      if (content) await reply.reply(content);
      return reaction;
    },
  };
  return ctx;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
