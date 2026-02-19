/**
 * @fuego v1.0.0
 * @author painfuego (www.codes-for.fun)
 * @copyright 2024 1sT - Services | CC BY-NC-SA 4.0
 */
import moment from "moment-timezone";
import { unlink } from "fs/promises";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AttachmentBuilder } from "discord.js";
import { zipper } from "../../../lib/utils/zipper.js";
import { Command } from "../../structures/abstract/command.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default class Backup extends Command {
  constructor() {
    super(...arguments);
    this.owner = true;
    this.aliases = ["backup"];
    this.description = "Sends backup-zip to DM";
    this.execute = async (client, ctx) => {
      const metadata = JSON.parse(
        await readFile(resolve(__dirname, "../../../package.json"), "utf8"),
      );
      const time = moment().tz("Asia/Kolkata").format("DD_MM_YY_hh_mm");
      const file = `./Nerox_v${metadata.version}_${time}.zip`;

      // Initial message
      const waitEmbed = await ctx.reply({
        embeds: [
          client
            .embed()
            .desc(`${client.emoji.timer} **Booting up the backup process...**`),
        ],
      });

      // Suspenseful steps
      const steps = [
        "Engaging core systems...",
        "Decrypting necessary files...",
        "Analyzing command structures...",
        "Scanning for inconsistencies...",
        "Neutralizing potential conflicts...",
        "Optimizing storage pathways...",
        "Compressing data streams...",
        "Finalizing encryption layers...",
        `Backup sequence initialized: Crafting \`${file}\`...`,
        "Executing final validation checks...",
        "All systems green. Preparing for dispatch...",
      ];

      for (const [index, step] of steps.entries()) {
        await new Promise((r) => setTimeout(r, 2000)); // Small delay for suspense
        await waitEmbed.edit({
          embeds: [
            client
              .embed()
              .desc(
                `${client.emoji.check} ${steps.slice(0, index + 1).join("\n")}\n${client.emoji.timer} **${steps[index + 1] || "Engaging transmission protocols..."}**`,
              ),
          ],
        });
      }

      // Create backup
      await zipper(file);

      // Send backup file
      const sent = await ctx.author
        .send({
          files: [new AttachmentBuilder(file, { name: file })],
        })
        .then(() => true)
        .catch((error) => (console.log(error), false));

      // Final edit
      await waitEmbed.edit({
        embeds: [
          client
            .embed()
            .desc(
              sent
                ? `${client.emoji.check} **Mission success!** \`${file}\` has been secured and dispatched.`
                : `${client.emoji.cross} **Mission failed!** Unable to transmit \`${file}\`. Consult the logs for details.`,
            ),
        ],
      });

      // Cleanup
      await unlink(file);
    };
  }
}
