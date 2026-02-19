import { connect247 } from "../../../lib/services/connect247.js";
const event = "playerDestroy";
export default class PlayerDetsroy {
  constructor() {
    this.name = event;
  }
  async execute(client, player) {
    await player.data
      .get("playEmbed")
      ?.edit({
        embeds: [
          client
            .embed()
            .desc(
              `**Enjoying the Music Experience?**\n\n` +
                `If you're finding value in the music, why not share it with others?\n` +
                `Consider [**referring me**](${client.invite.admin()}) to your friends and colleagues.\n` +
                `Your support helps improve the service, and together, we can continue providing great music for everyone.`,
            )
            .setAuthor({
              iconURL: client.user.displayAvatarURL(),
              name: client.user.username,
            })
            .thumb(client.user.displayAvatarURL()),
        ],
        components: [],
      })
      .catch(() => null);
    await client.sleep(1.5);
    if (await client.db.twoFourSeven.has(player.guildId))
      await connect247(client, player.guildId);
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
