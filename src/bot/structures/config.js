import { config as loadEnv } from "dotenv";

// Load environment variables first
loadEnv();

export const config = {
  token: process.env.DISCORD_TOKEN,
  owners: process.env.OWNER_IDS?.split(",") || [
    "1349404026965463072",
    "991517803700027443",
  ],
  admins: process.env.ADMIN_IDS?.split(",") || ["991517803700027443"],
  prefix: process.env.PREFIX || "&",
  links: {
    support: process.env.SUPPORT_SERVER || "https://discord.gg/p6nXDJMeyc",
  },
  backup: process.env.BACKUP_CHANNEL || "1347901024026759278",
  // Webhooks are dynamically created and stored in database
};
