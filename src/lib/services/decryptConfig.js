import { readFileSync } from "fs";
import { createDecipheriv } from "node:crypto";
export const decryptConfig = (configFile) => {
  const iv = Buffer.from(process.env.IV, "hex");
  const key = Buffer.from(process.env.KEY, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  const encryptedData = readFileSync(configFile, "utf-8");
  const decryptedData =
    decipher.update(encryptedData, "hex", "utf-8") + decipher.final("utf-8");
  return JSON.parse(decryptedData);
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
