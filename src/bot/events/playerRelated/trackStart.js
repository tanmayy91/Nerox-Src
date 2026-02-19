import moment from "moment";
import { ActionRowBuilder } from "discord.js";
import { generatePlayEmbed } from "../../../lib/services/generatePlayEmbed.js";

const event = "trackStart";

export default class PlayerStart {
  constructor() {
    this.name = event;
  }

  async execute(client, player, track) {
    if (!track.title || !player.textId) return;

    player.data.set("autoplayFromTrack", track);
    const channel = client.channels.cache.get(player.textId);
    if (!channel?.isTextBased() || !("send" in channel)) return;

    const embed = generatePlayEmbed(client, player);

    // Add thumbnail to the embed for a simple, clean look
    if (track.thumbnail) {
      embed.setThumbnail(track.thumbnail);
    }

    const playEmbed = await channel.send({
      embeds: [embed],

      components: [
        new ActionRowBuilder().addComponents([
          client
            .button()
            .secondary(
              `playEmbedButton_${player.guildId}_prev`,
              ``,
              client.emoji.previous,
            ),
          client
            .button()
            .secondary(
              `playEmbedButton_${player.guildId}_pause`,
              ``,
              client.emoji.pause,
            ),
          client
            .button()
            .secondary(
              `playEmbedButton_${player.guildId}_next`,
              ``,
              client.emoji.next,
            ),
          client
            .button()
            .secondary(
              `playEmbedButton_${player.guildId}_stop`,
              ``,
              client.emoji.stop,
            ),
          client
            .button()
            ?.[
              player?.data.get("autoplayStatus") ? "success" : "secondary"
            ](`playEmbedButton_${player.guildId}_autoplay`, ``, client.emoji.autoplay),
        ]),
        new ActionRowBuilder().addComponents([
          client
            .button()
            .secondary(
              `playEmbedButton_${player.guildId}_like`,
              `Like`,
              client.emoji.heart,
            ),
        ]),
      ],
    });

    player.data.set("playEmbed", playEmbed);

    const requesterId = track.requester?.id || "unknown";
    const date = moment().tz("Asia/Kolkata").format("DD-MM-YYYY");

    try {
      const [dailyCount, totalCount, userCount, guildCount] = await Promise.all(
        [
          client.db.stats.songsPlayed.get(date).catch(() => 0),
          client.db.stats.songsPlayed.get("total").catch(() => 0),
          client.db.stats.songsPlayed.get(requesterId).catch(() => 0),
          client.db.stats.songsPlayed.get(player.guildId).catch(() => 0),
        ],
      );

      await Promise.all([
        client.db.stats.songsPlayed.set(date, (dailyCount ?? 0) + 1),
        client.db.stats.songsPlayed.set("total", (totalCount ?? 0) + 1),
        client.db.stats.songsPlayed.set(requesterId, (userCount ?? 0) + 1),
        client.db.stats.songsPlayed.set(player.guildId, (guildCount ?? 0) + 1),
      ]);
    } catch (err) {
      console.error("Error updating song stats:", err);
    }

    await client.webhooks.playerLogs.send({
      username: `Player-logs`,
      avatarURL: `${client.user?.displayAvatarURL()}`,
      embeds: [
        client
          .embed()
          .desc(
            `${client.emoji.info} **[${moment().tz("Asia/Kolkata")}]** Started playing \`${track.title.substring(0, 30)}\` ` +
              `in guild named \`${client.guilds.cache.get(player.guildId)?.name.substring(0, 20)}\` (${player.guildId}). ` +
              `Track requested by \`${track.requester?.tag}\`.`,
          ),
      ],
    });
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
