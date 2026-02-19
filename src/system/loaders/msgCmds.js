import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
export const loadCommands = async (client) => {
  let totalCommandCount = 0;
  for (const category of await readdir(
    resolve(__dirname, "../../bot/commands"),
  )) {
    for (const file of await readdir(
      resolve(__dirname, "../../bot/commands", category),
    )) {
      if (!file.endsWith(".js")) continue;
      const command = new (
        await import(
          pathToFileURL(
            resolve(__dirname, "../../bot/commands", category, file),
          ).href
        )
      ).default();
      command.category = category.toLowerCase();
      command.name = file.split(".")[0].toLowerCase();
      command.nsfw = category === "nsfw" ? true : false;
      command.owner = category === "owner" ? true : false;
      client.commands.set(command.name, command);
      totalCommandCount++;
    }
  }
  client.log(`Loaded ${totalCommandCount} message commands`, "success");
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
