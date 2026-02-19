import { filter } from "../../../lib/utils/filter.js";
import { Command } from "../../structures/abstract/command.js";
import { ActionRowBuilder } from "discord.js";
export default class Join extends Command {
  constructor() {
    super(...arguments);
    this.inVC = true;
    this.aliases = ["j", "move"];
    this.description = "join/move the bot";
    this.execute = async (client, ctx) => {
      const player = client.getPlayer(ctx);
      if (!player || !ctx.guild.members.me?.voice.channelId) {
        if (player) await player.destroy().catch(() => null);
        await client.manager.createPlayer({
          deaf: true,
          loadBalancer: true,
          guildId: ctx.guild.id,
          textId: ctx.channel.id,
          shardId: ctx.guild.shardId,
          voiceId: ctx.member.voice.channel.id,
        });
        await ctx.reply({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.check} Joined ${ctx.member.voice.channel} and bound to ${ctx.channel}.`,
              ),
          ],
        });
        return;
      }
      const reply = await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(
              (player.queue.current
                ? `${client.emoji.warn} People are listening to songs in ${ctx.guild.members.me.voice.channel}.\n`
                : `${client.emoji.info} I am already connected to ${ctx.guild.members.me.voice.channel}.\n`) +
                `${client.emoji.info} This changes 247 config and player's text channel too.`,
            ),
        ],
        components: [
          new ActionRowBuilder().addComponents([
            client.button().secondary(`move`, `Move me`),
          ]),
        ],
      });
      const collector = reply.createMessageComponentCollector({
        idle: 10000,
        filter: async (interaction) => await filter(interaction, ctx),
      });
      collector.on("collect", async (interaction) => {
        collector.stop();
        await interaction.deferUpdate();
        player.textId = ctx.channel.id;
        ctx.guild.members.me.voice.setChannel(ctx.member.voice.channel.id);
        await reply.edit({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.check} Moved to ${ctx.member.voice.channel} and bound to ${ctx.channel}.`,
              ),
          ],
          components: [],
        });
        if (!(await client.db.twoFourSeven.has(player.guildId))) return;
        await client.db.twoFourSeven.set(player.guildId, {
          textId: player.textId,
          voiceId: player.voiceId,
        });
      });
      collector.on("end", async (collected) => {
        if (collected.size) return;
        await reply.edit({
          embeds: [
            client.embed().desc(reply.embeds[0].description).footer({
              text: "Join/move command timed out !",
            }),
          ],
          components: [],
        });
      });
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
