import { log } from "../../logger.js";
import { createCipheriv, randomBytes } from "node:crypto";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
const iv = randomBytes(16);
const key = randomBytes(32);
export const bind = (source, dest) => {
  log(`Generating new ${dest}`);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = cipher.update(readFileSync(source, "utf8"), "utf-8", "hex");
  const encryptData = encrypted + cipher.final("hex");
  writeFileSync(dest, encryptData, "utf-8");
  unlinkSync(source);
  log(`New ${dest} generated`, "success");
  log("Save the following credentials securely.", "warn");
  log(`Initialization Vector (IV): ${iv.toString("hex")}`, "info");
  log(`Decryption key (Key): ${key.toString("hex")}`, "info");
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
