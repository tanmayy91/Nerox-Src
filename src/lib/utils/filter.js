export const filter = async (interaction, ctx) => {
  const client = interaction.client;
  if (
    interaction.user.id === ctx.author.id ||
    client.owners.includes(interaction.user.id)
  )
    return true;
  await interaction.reply({
    embeds: [
      client
        .embed()
        .desc(`${client.emoji.cross} This is reserved for ${ctx.author}.`),
    ],
    ephemeral: true,
  });
  return false;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
