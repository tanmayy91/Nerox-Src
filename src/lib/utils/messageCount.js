import moment from "moment";

/**
 * Add a message to the user's count.
 * @param {Client} client - The bot client.
 * @param {string} guildId - The server ID.
 * @param {string} userId - The user's ID.
 */
export async function addMessageCount(client, guildId, userId) {
  const key = `${guildId}_${userId}`;
  const today = moment().format("YYYY-MM-DD");

  const data = (await client.db.msgCount.get(key)) || {
    allTime: 0,
    daily: {},
  };

  data.allTime += 1;
  data.daily[today] = (data.daily[today] || 0) + 1;

  await client.db.msgCount.set(key, data);
}

/**
 * Get a user's message data.
 * @param {Client} client
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<{allTime: number, today: number}>}
 */
export async function getMessageCount(client, guildId, userId) {
  const key = `${guildId}_${userId}`;
  const today = moment().format("YYYY-MM-DD");
  const data = (await client.db.msgCount.get(key)) || {
    allTime: 0,
    daily: {},
  };

  return {
    allTime: data.allTime || 0,
    today: data.daily[today] || 0,
  };
}

/**
 * Clear messages for a user or entire server.
 * @param {Client} client
 * @param {string} guildId
 * @param {string|null} userId - If null, clears all users in server.
 */
export async function clearMessageCount(client, guildId, userId = null) {
  if (userId) {
    const key = `${guildId}_${userId}`;
    await client.db.msgCount.delete(key);
  } else {
    const all = await client.db.msgCount.get(client.db.msgCount.all);
    for (const id of Object.keys(all ?? {}).filter((k) => k.startsWith(`${guildId}_`))) {
      await client.db.msgCount.delete(id);
    }
  }
}

/**
 * Get the message leaderboard for a server.
 * @param {Client} client
 * @param {string} guildId
 * @param {'all' | 'daily'} type
 * @param {number} limit
 * @returns {Promise<Array<{ userId: string, count: number }>>}
 */
export async function getLeaderboard(
  client,
  guildId,
  type = "all",
  limit = 10,
) {
  const all = await client.db.msgCount.get(client.db.msgCount.all);
  const today = moment().format("YYYY-MM-DD");

  const filtered = Object.entries(all ?? {})
    .filter(([id]) => id.startsWith(`${guildId}_`))
    .map(([id, data]) => ({
      userId: id.split("_")[1],
      count: type === "daily" ? data?.daily?.[today] || 0 : data?.allTime || 0,
    }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  return filtered;
}
