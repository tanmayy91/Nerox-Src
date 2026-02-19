/**
 * Get the guild-specific prefix or fall back to global prefix
 * @param {Object} client - Discord client
 * @param {string} guildId - Guild ID
 * @returns {Promise<string>} The prefix for the guild
 */
export const getPrefix = async (client, guildId) => {
  if (!guildId) return client.prefix;
  const guildPrefix = await client.db.prefix.get(guildId);
  return guildPrefix || client.prefix;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
