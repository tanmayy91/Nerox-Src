import { createContext } from "../../../lib/services/contextFrom/interaction.js";
const event = "interactionCreate";

export default class InteractionCreate {
  constructor() {
    this.name = event;
  }

  execute = async (client, interaction) => {
    if (!interaction || interaction.user?.bot) return;

    // Buttons
    if (interaction.isButton()) {
      // Ticket handler
      if (interaction.customId === "create_ticket") {
        const guildId = interaction.guildId;
        const userId = interaction.user.id;

        const panels = (await client.db.ticket.get(guildId)) || [];
        const panel = panels.find(
          (p) => p.messageId === interaction.message.id,
        );
        if (!panel) {
          return interaction.reply({
            ephemeral: true,
            content: "This ticket panel no longer exists or was deleted.",
          });
        }

        const existing = interaction.guild.channels.cache.find(
          (ch) =>
            ch.name ===
              `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/gi, "")}` &&
            ch.parentId === panel.categoryId,
        );

        if (existing) {
          return interaction.reply({
            ephemeral: true,
            content: `You already have an open ticket: <#${existing.id}>`,
          });
        }

        const channel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/gi, "")}`,
          parent: panel.categoryId,
          permissionOverwrites: [
            {
              id: interaction.guild.roles.everyone.id,
              deny: ["ViewChannel"],
            },
            {
              id: userId,
              allow: ["ViewChannel", "SendMessages", "AttachFiles"],
            },
            ...(panel.pingRole
              ? [
                  {
                    id: panel.pingRole,
                    allow: ["ViewChannel", "SendMessages"],
                  },
                ]
              : []),
          ],
        });

        await interaction.reply({
          ephemeral: true,
          content: `Ticket created: <#${channel.id}>`,
        });

        const embed = client
          .embed()
          .title("Support Ticket")
          .desc(
            `Welcome ${interaction.user}, our team will assist you shortly.`,
          )
          .footer({
            text: "Use the close command or button when your issue is resolved.",
          });

        await channel.send({
          content: panel.pingRole ? `<@&${panel.pingRole}>` : null,
          embeds: [embed],
        });

        return;
      }

      return void client.emit("buttonClick", interaction);
    }

    // Slash Commands
    if (interaction.isCommand()) {
      await interaction.deferReply().catch(() => null);
      return void client.emit(
        "ctxCreate",
        await createContext(client, interaction),
      );
    }

    // Autocomplete
    if (interaction.isAutocomplete()) {
      const commandName = interaction.commandName;
      const query = interaction.options.getString("query");

      if (["play", "search"].includes(commandName) && query) {
        try {
          const res = await client.manager.search(query, {
            engine: "youtube",
            requester: interaction.user,
          });

          const songs = res.tracks?.slice(0, 10).map((track) => ({
            name: track.title,
            value: track.uri,
          }));

          if (songs?.length) {
            await interaction.respond(songs);
          }
        } catch (err) {
          // Optionally log the error
        }
      }
    }
  };
}
