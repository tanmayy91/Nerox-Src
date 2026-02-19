/**
 * Webhook Setup System
 * Creates a hidden category with channels for bot logs and generates webhooks
 * Only runs once - stores webhook URLs in database
 */

import { ChannelType, PermissionFlagsBits } from "discord.js";

const LOG_GUILD_ID = "1439610258283823217";
const CATEGORY_NAME = "bot logs";

const WEBHOOK_CHANNELS = [
  { name: "logs", key: "logs" },
  { name: "server-add", key: "serveradd" },
  { name: "server-remove", key: "serverchuda" },
  { name: "player-logs", key: "playerLogs" },
  { name: "blacklist-logs", key: "blLogs" },
  { name: "database", key: "database" },
];

/**
 * Setup webhooks for the bot
 * @param {import('../bot/structures/client.js').ExtendedClient} client
 */
export async function setupWebhooks(client) {
  try {
    // Check if webhooks are already set up in config database
    const webhooksDb = await client.db.config.get("webhookUrls");

    if (
      webhooksDb &&
      Object.keys(webhooksDb).length === WEBHOOK_CHANNELS.length
    ) {
      client.log("Webhooks already configured, skipping setup", "info");
      return webhooksDb;
    }

    client.log("Setting up webhooks...", "info");

    // Fetch the guild
    const guild = await client.guilds.fetch(LOG_GUILD_ID).catch(() => null);
    if (!guild) {
      client.log(`Could not find guild ${LOG_GUILD_ID}, Please Set Your Guild ID in *setupWebhooks.js for logging.`, "warn");
      return null;
    }

    // Find or create the category
    let category = guild.channels.cache.find(
      (c) =>
        c.type === ChannelType.GuildCategory &&
        c.name.toLowerCase() === CATEGORY_NAME.toLowerCase(),
    );

    if (!category) {
      client.log(`Creating category: ${CATEGORY_NAME}`, "info");
      category = await guild.channels.create({
        name: CATEGORY_NAME,
        type: ChannelType.GuildCategory,
        permissionOverwrites: [
          {
            id: guild.id, // @everyone role
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: client.user.id, // Bot itself
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ManageWebhooks,
            ],
          },
        ],
      });
    }

    const webhookUrls = {};

    // Create channels and webhooks
    for (const { name, key } of WEBHOOK_CHANNELS) {
      let channel = guild.channels.cache.find(
        (c) => c.parentId === category.id && c.name === name,
      );

      if (!channel) {
        client.log(`Creating channel: ${name}`, "info");
        channel = await guild.channels.create({
          name: name,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: client.user.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageWebhooks,
              ],
            },
          ],
        });
      }

      // Check if webhook already exists for this channel
      const existingWebhooks = await channel.fetchWebhooks();
      let webhook = existingWebhooks.find(
        (wh) => wh.owner?.id === client.user.id,
      );

      if (!webhook) {
        client.log(`Creating webhook for channel: ${name}`, "info");
        webhook = await channel.createWebhook({
          name: `${client.user.username} - ${name}`,
          avatar: client.user.displayAvatarURL(),
        });
      }

      webhookUrls[key] = webhook.url;
      client.log(`Webhook configured for ${name}: ${webhook.id}`, "info");
    }

    // Store webhook URLs in config database
    await client.db.config.set("webhookUrls", webhookUrls);
    client.log("Webhook setup complete!", "info");

    return webhookUrls;
  } catch (error) {
    client.log(`Error setting up webhooks: ${error.message}`, "error");
    console.error(error);
    return null;
  }
}
