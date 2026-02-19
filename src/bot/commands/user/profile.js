/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */
import { paginator } from "../../../lib/utils/paginator.js";
import { Command } from "../../structures/abstract/command.js";
import { getPrefix } from "../../../lib/utils/getPrefix.js";
export default class Profile extends Command {
  constructor() {
    super(...arguments);
    this.aliases = ["pr"];
    this.description = "Shows user profile";
    this.execute = async (client, ctx) => {
      const prefix = await getPrefix(client, ctx.guild.id);
      let [
        commandsUsed,
        songsPlayed,
        likedSongs,
        spotifyData,
        afkData,
        premiumData,
      ] = await Promise.all([
        client.db.stats.commandsUsed.get(ctx.author.id),
        client.db.stats.songsPlayed.get(ctx.author.id),
        client.db.likedSongs.get(ctx.author.id),
        client.db.spotify.get(ctx.author.id),
        client.db.afk.get(ctx.author.id),
        client.db.botstaff.get(ctx.author.id),
      ]);
      songsPlayed ||= 0;
      commandsUsed ||= 0;
      likedSongs ||= [];

      // Calculate user level based on commands and songs
      const totalActivity = commandsUsed + songsPlayed;
      const level = Math.floor(totalActivity / 50) + 1;
      const nextLevelProgress = totalActivity % 50;
      const progressBar = this.generateProgressBar(nextLevelProgress, 50);

      // Calculate account age
      const accountAge = Math.floor(
        (Date.now() - ctx.author.createdTimestamp) / (1000 * 60 * 60 * 24),
      );
      const achievements = {
        commands: [],
        songs: [],
      };
      const challenges = {
        commands: {
          "basic user": { count: 10, emoji: client.emoji.check },
          "junior user": { count: 50, emoji: client.emoji.check },
          "senior user": { count: 100, emoji: client.emoji.check },
          "master user": { count: 500, emoji: client.emoji.check },
          "unhinged user": { count: 1000, emoji: client.emoji.check },
        },
        songsPlayed: {
          "basic listener": { count: 10, emoji: client.emoji.check },
          "junior listener": { count: 50, emoji: client.emoji.check },
          "senior listener": { count: 100, emoji: client.emoji.check },
          "master listener": { count: 500, emoji: client.emoji.check },
          "unhinged listener": { count: 1000, emoji: client.emoji.check },
        },
      };
      Object.entries(challenges.commands).forEach(([key, { count }]) => {
        const achievement = key.charAt(0).toUpperCase() + key.slice(1);
        achievements.commands.push(
          commandsUsed >= count
            ? `${client.emoji.check} **${achievement} :** Complete ( ${count} / ${count} )`
            : `${client.emoji.info} **${achievement} :** Progress ( ${commandsUsed} / ${count} )`,
        );
      });
      Object.entries(challenges.songsPlayed).forEach(([key, { count }]) => {
        const achievement = key.charAt(0).toUpperCase() + key.slice(1);
        achievements.songs.push(
          songsPlayed >= count
            ? `${client.emoji.check} **${achievement} :** Complete ( ${count} / ${count} )`
            : `${client.emoji.info} **${achievement} :** Progress ( ${songsPlayed} / ${count} )`,
        );
      });
      const badges = [];
      if (
        client.owners.includes(ctx.author.id) ||
        client.admins.includes(ctx.author.id) ||
        (await client.db.noPrefix.has(ctx.author.id))
      )
        badges.push(`${client.emoji.check} **No Prefix** (Pay to get it)`);
      if (ctx.author.id === "1056087251068649522")
        badges.push(`${client.emoji.check} **Developer** (Only for me)`);
      if (client.admins.includes(ctx.author.id))
        badges.push(`${client.emoji.check} **Admin** (Only for bot admins)`);
      if (client.owners.includes(ctx.author.id))
        badges.push(`${client.emoji.check} **Owner** (Only for bot owners)`);
      for (const [key, value] of Object.entries(challenges.commands))
        if (commandsUsed >= value.count)
          badges.push(
            `${value.emoji} **${key[0].toUpperCase() + key.slice(1)}** (Use any command/s ${value.count} times)`,
          );
      for (const [key, value] of Object.entries(challenges.songsPlayed))
        if (songsPlayed >= value.count)
          badges.push(
            `${value.emoji} **${key[0].toUpperCase() + key.slice(1)}** (Listen to any song/s ${value.count} times)`,
          );

      // Overview Page
      const overviewEmbed = client
        .embed()
        .setAuthor({
          name: `${ctx.author.username}'s Profile`,
          iconURL: ctx.author.displayAvatarURL(),
        })
        .setThumbnail(ctx.author.displayAvatarURL({ size: 512 }))
        .desc(
          `╔══════════════════════════════╗\n` +
            `║           **OVERVIEW**           ║\n` +
            `╚══════════════════════════════╝\n\n` +
            `${client.emoji.info} **Level:** ${level} ${this.getLevelEmoji(level)}\n` +
            `${client.emoji.info1} Progress: ${progressBar} ${nextLevelProgress}/50\n\n` +
            `📊 **Statistics:**\n` +
            `${client.emoji.info1} Commands Used: **${commandsUsed}**\n` +
            `${client.emoji.info1} Songs Played: **${songsPlayed}**\n` +
            `${client.emoji.info1} Liked Songs: **${likedSongs.length}**\n\n` +
            `💎 **Status:**\n` +
            `${client.emoji.info1} Premium: ${premiumData ? `${client.emoji.check} Active` : `${client.emoji.cross} Inactive`}\n` +
            `${client.emoji.info1} AFK: ${afkData ? `${client.emoji.check} ${afkData.reason}` : `${client.emoji.cross} No`}\n` +
            `${client.emoji.info1} Spotify: ${spotifyData ? `${client.emoji.music} Linked` : `${client.emoji.cross} Not Linked`}\n\n` +
            `📅 **Account Info:**\n` +
            `${client.emoji.info1} Discord User ID: \`${ctx.author.id}\`\n` +
            `${client.emoji.info1} Account Age: **${accountAge} days**\n` +
            `${client.emoji.info1} Joined Discord: <t:${Math.floor(ctx.author.createdTimestamp / 1000)}:R>`,
        )
        .setFooter({ text: `Page 1/4 • ${ctx.author.tag}` })
        .setTimestamp();

      const badgesEmbed = client
        .embed()
        .setAuthor({
          name: `${ctx.author.username}'s Badges`,
          iconURL: ctx.author.displayAvatarURL(),
        })
        .setThumbnail(ctx.author.displayAvatarURL({ size: 512 }))
        .desc(
          `╔══════════════════════════════╗\n` +
            `║            **BADGES**            ║\n` +
            `╚══════════════════════════════╝\n\n` +
            (badges.length
              ? badges.join("\n\n")
              : `${client.emoji.warn} **No badges yet!**\n\n` +
                `${client.emoji.info} Complete achievements to earn badges!\n` +
                `${client.emoji.info} Check the Achievements page to see your progress.`),
        )
        .setFooter({ text: `Page 2/4 • Total Badges: ${badges.length}` })
        .setTimestamp();

      const achievementsEmbed = client
        .embed()
        .setAuthor({
          name: `${ctx.author.username}'s Achievements`,
          iconURL: ctx.author.displayAvatarURL(),
        })
        .setThumbnail(ctx.author.displayAvatarURL({ size: 512 }))
        .desc(
          `╔══════════════════════════════╗\n` +
            `║        **ACHIEVEMENTS**       ║\n` +
            `╚══════════════════════════════╝\n\n` +
            Object.entries(achievements)
              .map(
                ([key, value]) =>
                  `**${key === "commands" ? `${client.emoji.check} Commands` : `${client.emoji.music} Songs`} Achievements:**\n` +
                  `${value.join("\n")}`,
              )
              .join("\n\n"),
        )
        .setFooter({ text: `Page 3/4 • Keep grinding!` })
        .setTimestamp();

      // Music & Spotify Page
      let musicDesc =
        `╔══════════════════════════════╗\n` +
        `║       **MUSIC & SPOTIFY**     ║\n` +
        `╚══════════════════════════════╝\n\n`;

      if (spotifyData) {
        const linkedDate = new Date(spotifyData.linkedAt).toLocaleDateString(
          "en-US",
          {
            year: "numeric",
            month: "short",
            day: "numeric",
          },
        );
        musicDesc +=
          `${client.emoji.music} **Spotify Connected**\n` +
          `${client.emoji.info1} Username: **${spotifyData.username}**\n` +
          `${client.emoji.info1} Profile: [View Profile](${spotifyData.profileUrl})\n` +
          `${client.emoji.info1} Linked Since: ${linkedDate}\n\n`;
      } else {
        musicDesc +=
          `${client.emoji.music} **Spotify Not Connected**\n` +
          `${client.emoji.info1} Link: \`${prefix}spotify login <url>\`\n\n`;
      }

      musicDesc += `${client.emoji.heart} **Liked Songs**\n`;
      if (likedSongs.length > 0) {
        musicDesc += `${client.emoji.info1} Total Liked: **${likedSongs.length} songs**\n`;

        // Show top 5 most recently liked songs
        const recentLikes = likedSongs.slice(-5).reverse();
        musicDesc += `${client.emoji.info1} Recent Likes:\n`;
        recentLikes.forEach((song, index) => {
          musicDesc += `  **${index + 1}.** ${song.title}\n`;
        });

        musicDesc += `\n${client.emoji.info} Use \`${prefix}showliked\` to see all!\n`;
        musicDesc += `${client.emoji.info} Use \`${prefix}playliked\` to play them!\n`;
      } else {
        musicDesc +=
          `${client.emoji.info1} No liked songs yet!\n` +
          `${client.emoji.info} Use \`${prefix}like\` while playing a song to add it!\n`;
      }

      const musicEmbed = client
        .embed()
        .setAuthor({
          name: `${ctx.author.username}'s Music`,
          iconURL: ctx.author.displayAvatarURL(),
        })
        .setThumbnail(ctx.author.displayAvatarURL({ size: 512 }))
        .desc(musicDesc)
        .setFooter({ text: `Page 4/4 • Keep vibing!` })
        .setTimestamp();

      await paginator(ctx, [
        overviewEmbed,
        badgesEmbed,
        achievementsEmbed,
        musicEmbed,
      ]);
    };
  }

  generateProgressBar(current, max) {
    const percentage = (current / max) * 100;
    const filled = Math.floor(percentage / 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  }

  getLevelEmoji(level) {
    if (level >= 50) return "👑";
    if (level >= 30) return "⭐";
    if (level >= 20) return "💎";
    if (level >= 10) return "🔥";
    if (level >= 5) return "✨";
    return "🌱";
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
