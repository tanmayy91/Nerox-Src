import { execute } from "../../../lib/services/context/execute.js";
import { resolveNsfw } from "../../../lib/services/context/resolveNsfw.js";
import { resolvePerms } from "../../../lib/services/context/resolvePerms.js";
import { enforceAdmin } from "../../../lib/services/context/enforceAdmin.js";
import { resolveVoice } from "../../../lib/services/context/resolveVoice.js";
import { resolvePlayer } from "../../../lib/services/context/resolvePlayer.js";
import { isUnderCooldown } from "../../../lib/services/context/checkCooldown.js";
import { resolvePrefix } from "../../../lib/services/context/resolvePrefix.js";
import { resolveCommand } from "../../../lib/services/context/resolveCommand.js";
import { resolveBotAdmin } from "../../../lib/services/context/resolveBotAdmin.js";

const event = "ctxCreate";

// Helper function to check if noPrefix is active (with expiry support)
// Same pattern as premium - expired entries are cleaned up at startup
function isNoPrefixActive(noPrefixData) {
  if (!noPrefixData) return false;

  // Legacy format (just true) - treat as permanent
  if (noPrefixData === true) return true;

  // New format with object
  if (typeof noPrefixData === "object") {
    // Permanent noprefix
    if (noPrefixData.permanent) return true;

    // Check expiry (same as premium)
    const expiryTime = noPrefixData.expiresAt || noPrefixData.expires;
    if (expiryTime && expiryTime < Date.now()) {
      return false; // Expired
    }

    // Has expiry in future or no expiry set = active
    return true;
  }

  return false;
}

// Helper function to check if premium is active (with expiry support)
// Expired entries are cleaned up at startup in readyEvent.js
function isPremiumActive(premiumData) {
  if (!premiumData) return false;

  // Check if it's an object with expiry
  if (typeof premiumData === "object") {
    // Permanent premium
    if (premiumData.permanent) return true;

    // Check expiry (same pattern as checkPremiumExpiries)
    const expiryTime = premiumData.expiresAt || premiumData.expires;
    if (expiryTime && expiryTime < Date.now()) {
      return false; // Expired
    }

    // Has expiry in future or no expiry set = active
    return true;
  }

  // Legacy format or simple truthy value
  return !!premiumData;
}

export default class ContextCreate {
  constructor() {
    this.name = event;
    this.execute = async (client, ctx) => {
      if (!ctx) return;

      const [owner, admin, noPrefixData, bl, premiumData] = await Promise.all([
        client.owners.includes(ctx.author.id),
        client.admins.includes(ctx.author.id),
        client.db.noPrefix.get(ctx.author.id),
        client.db.blacklist.get(ctx.author.id),
        client.db.botstaff.get(ctx.author.id), // Premium Users - get full data for expiry check
      ]);

      const botAdmin = owner || admin ? true : false;
      const np = botAdmin || isNoPrefixActive(noPrefixData) ? true : false;
      const staff = isPremiumActive(premiumData);

      if (bl) return;
      if (!(await resolvePerms.basic(ctx))) return;
      if (ctx.content.match(new RegExp(`^<@!?${client.user.id}>( |)$`)))
        return void client.emit("mention", ctx);

      const resolvedPrefix = await resolvePrefix(ctx, np);
      if (resolvedPrefix === null) return;

      const { command, args } = await resolveCommand(ctx, resolvedPrefix);
      if (!command) return;

      if (!botAdmin && (await isUnderCooldown(ctx, command))) return;
      if (!(await enforceAdmin(ctx))) return;
      if (!(await resolvePerms.user(ctx, command, botAdmin))) return;
      if (!(await resolveBotAdmin(ctx, command))) return;

      // Premium users can use the bot during maintenance
      if (client.underMaintenance && !(botAdmin || staff))
        return void client.emit("underMaintenance", ctx);

      if (args[0]?.toLowerCase() === "-guide")
        return void client.emit("infoRequested", ctx, command);
      if (!(await resolveVoice(ctx, command))) return;
      if (!(await resolvePlayer(ctx, command))) return;
      if (!(await resolveNsfw(ctx, command))) return;

      await execute(ctx, command, args);
    };
  }
}

/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
