import { updatePlayerButtons } from "../../../lib/services/updatePlayerButtons.js";
const event = "playerButtonClick";
export default class PlayerButtonClick {
  constructor() {
    this.name = event;
    this.execute = async (client, interaction) => {
      const parts = interaction.customId.split("_");
      if (parts.length < 3) {
        console.error("Invalid customId format:", interaction.customId);
        return;
      }
      const button = parts[2];
      const guildId = parts[1];
      const botVc = interaction.guild?.members.me?.voice.channel;
      const player = client.getPlayer({ guild: { id: guildId } });
      const memberVc = interaction.member?.voice.channel;
      const playEmbedId = player?.data.get("playEmbed")?.id;
      if (!player || interaction.message.id !== playEmbedId) {
        try {
          await interaction.message.delete();
        } catch (err) {
          // Ignore errors when deleting message (might be already deleted)
        }
        return;
      }
      if (memberVc?.id !== botVc?.id) {
        await interaction.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.cross} You must be in ${botVc?.name || "the same voice channel"} to be able to do this.`,
              ),
          ],
          ephemeral: true,
        });
        return;
      }
      switch (button) {
        case "stop":
          await player.destroy();
          break;
        case "pause":
          player.pause(true);
          await updatePlayerButtons(client, player);
          break;
        case "resume":
          player.pause(false);
          await updatePlayerButtons(client, player);
          break;
        case "autoplay":
          player?.data.get("autoplayStatus")
            ? player?.data.delete("autoplayStatus")
            : player?.data.set("autoplayStatus", true);
          await updatePlayerButtons(client, player);
          break;
        case "next":
          if (player.queue.length === 0 && !player.data.get("autoplayStatus")) {
            await interaction.reply({
              embeds: [
                client
                  .embed()
                  .desc(
                    `${client.emoji.cross} No more songs left in the queue to skip.`,
                  ),
              ],
              ephemeral: true,
            });
            break;
          }
          await player.shoukaku.stopTrack();
          break;
        case "prev":
          {
            const previousTrack = player.queue.previous.pop();
            if (!previousTrack) {
              await interaction.reply({
                embeds: [
                  client
                    .embed()
                    .desc(
                      `${client.emoji.cross} There are no previously played song/s.`,
                    ),
                ],
                ephemeral: true,
              });
              break;
            }
            player.queue.unshift(player.queue.current);
            player.queue.unshift(previousTrack);
            await player.shoukaku.stopTrack();
            // Note: We already popped once above, don't pop again
          }
          break;
        case "like":
          {
            try {
              const track = player.queue.current;
              if (!track) {
                await interaction.reply({
                  embeds: [
                    client
                      .embed()
                      .desc(
                        `${client.emoji.cross} No track is currently playing.`,
                      ),
                  ],
                  ephemeral: true,
                });
                break;
              }

              const userId = interaction.user.id;
              const likedSongs = (await client.db.likedSongs.get(userId)) || [];

              // Check if song is already liked
              const trackInfo = {
                title: track.title,
                author: track.author,
                uri: track.uri,
                length: track.length,
              };

              const isAlreadyLiked = likedSongs.some(
                (song) => song.uri === track.uri,
              );

              if (isAlreadyLiked) {
                await interaction.reply({
                  embeds: [
                    client
                      .embed()
                      .desc(
                        `${client.emoji.heart} You've already liked **${track.title}**!`,
                      ),
                  ],
                  ephemeral: true,
                });
              } else {
                likedSongs.push(trackInfo);
                await client.db.likedSongs.set(userId, likedSongs);

                await interaction.reply({
                  embeds: [
                    client
                      .embed()
                      .desc(
                        `${client.emoji.heart} Added **${track.title}** to your liked songs!`,
                      ),
                  ],
                  ephemeral: true,
                });
              }
            } catch (error) {
              console.error(
                "[Player Button] Error handling like button:",
                error,
              );
              await interaction
                .reply({
                  embeds: [
                    client
                      .embed()
                      .desc(
                        `${client.emoji.cross} Failed to like song. Please try again later.`,
                      ),
                  ],
                  ephemeral: true,
                })
                .catch(() => {});
            }
          }
          break;
      }
      if (!interaction.deferred && !interaction.replied)
        await interaction.deferUpdate();
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
