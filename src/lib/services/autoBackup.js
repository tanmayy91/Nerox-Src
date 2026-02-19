/**
 * Automatic Daily Database Backup System
 * Sends database backup as .zip file to webhook once daily
 */

import moment from "moment-timezone";
import { unlink } from "fs/promises";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AttachmentBuilder } from "discord.js";
import { createWriteStream } from "node:fs";
import archiver from "archiver";
import { access } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Configuration
const DATABASE_DIR = "./database-storage";
const TIMEZONE = "Asia/Kolkata";
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * Create zip file of database directory only
 * @param {string} zipPath - Output zip file path
 * @returns {Promise<string>} - Resolved zip path
 */
async function zipDatabase(zipPath) {
  const resolvedZipPath = resolve(zipPath);

  // Delete existing zip if present
  await access(resolvedZipPath)
    .then(async () => await unlink(resolvedZipPath))
    .catch(() => null);

  const output = createWriteStream(resolvedZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });

  archive.pipe(output);

  // Only add the database directory
  archive.directory(DATABASE_DIR, "database-storage");

  await archive.finalize();

  await new Promise((resolve) => {
    output.on("close", () => resolve());
  });

  return resolvedZipPath;
}

/**
 * Send database backup to webhook
 * @param {import('../bot/structures/client.js').ExtendedClient} client
 */
async function sendBackup(client) {
  try {
    if (!client.webhooks?.database) {
      client.log("Database webhook not configured, skipping backup", "warn");
      return;
    }

    client.log("Starting automatic database backup...", "info");

    const time = moment().tz(TIMEZONE).format("DD_MM_YY_HH_mm");
    const file = `./Database_Backup_${time}.zip`;

    // Create backup zip of database only
    await zipDatabase(file);
    client.log(`Database backup created: ${file}`, "info");

    // Send to webhook
    await client.webhooks.database.send({
      username: "Database Backup",
      avatarURL: client.user?.displayAvatarURL(),
      content: `📦 **Daily Database Backup** - ${moment().tz(TIMEZONE).format("DD/MM/YYYY HH:mm:ss")}`,
      files: [new AttachmentBuilder(file, { name: file })],
    });

    client.log("Database backup sent successfully", "success");

    // Cleanup
    await unlink(file);
    client.log("Backup file cleaned up", "info");

    // Update last backup time in database
    await client.db.config.set("lastBackup", Date.now());
  } catch (error) {
    client.log(`Error during automatic backup: ${error.message}`, "error");
    console.error(error);
  }
}

/**
 * Initialize automatic daily backup system
 * @param {import('../bot/structures/client.js').ExtendedClient} client
 */
export async function initAutoBackup(client) {
  try {
    const lastBackup = await client.db.config.get("lastBackup");
    const now = Date.now();

    // Check if backup is needed (if never backed up or more than 24 hours ago)
    if (!lastBackup || now - lastBackup >= BACKUP_INTERVAL) {
      // Send backup immediately
      await sendBackup(client);
    } else {
      const nextBackupIn = BACKUP_INTERVAL - (now - lastBackup);
      client.log(
        `Next backup scheduled in ${Math.round(nextBackupIn / 1000 / 60 / 60)} hours`,
        "info",
      );
    }

    // Schedule regular backups every 24 hours
    setInterval(async () => {
      await sendBackup(client);
    }, BACKUP_INTERVAL);

    client.log("Automatic daily backup system initialized", "info");
  } catch (error) {
    client.log(`Error initializing auto-backup: ${error.message}`, "error");
    console.error(error);
  }
}
