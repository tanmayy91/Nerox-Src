import { ActionRowBuilder } from "discord.js";
export const updatePlayerButtons = async (client, player) => {
  const playEmbed = player.data.get("playEmbed");
  await playEmbed.edit({
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
            `playEmbedButton_${player.guildId}_${player.paused ? "resume" : "pause"}`,
            ``,
            player.paused ? client.emoji.resume : client.emoji.pause,
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
    ],
  });
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
