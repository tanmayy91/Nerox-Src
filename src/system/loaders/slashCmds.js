/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */

export const deploySlashCommands = async (client) => {
  client.log("Slash commands are disabled.", "info");

  // Optional: Remove existing slash commands from Discord's API
  try {
    const { REST } = await import("discord.js");
    const rest = new REST().setToken(client.config.token);

    await rest.put(`/applications/${client.user.id}/commands`, { body: [] });
    client.log(
      "All previously registered slash commands have been removed.",
      "success",
    );
  } catch (error) {
    client.log("Failed to remove slash commands: " + error, "error");
  }
};
