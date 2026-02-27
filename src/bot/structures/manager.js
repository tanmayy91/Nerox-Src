import apple from "kazagumo-apple";
import deezer from "kazagumo-deezer";
import { Connectors } from "shoukaku";
import spotify from "kazagumo-spotify";
import { Kazagumo, Plugins } from "kazagumo";
import { autoplay } from "../../lib/services/autoplay.js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load Lavalink configuration from lava.json
let lavaConfig;
try {
  const configPath = resolve(__dirname, "../../../lava.json");
  lavaConfig = JSON.parse(readFileSync(configPath, "utf-8"));
} catch (error) {
  console.error(
    "Failed to load lava.json, using fallback configuration:",
    error.message,
  );
  lavaConfig = {
    nodes: [
      {
        name: "primary-node",
        host: "pnode1.danbot.host",
        port: 1427,
        password: "kaalahoon",
        secure: false,
        priority: 1,
      },
    ],
    defaultSearchEngine: "youtube",
    spotifyConfig: {
      clientId: "d62dc6e25a374aad8f035111f351ea85",
      clientSecret: "c807e75e805d4001be9fd81e4afd6272",
      searchLimit: 10,
      albumPageLimit: 1,
      searchMarket: "IN",
      playlistPageLimit: 1,
    },
    appleConfig: {
      imageWidth: 600,
      imageHeight: 900,
      countryCode: "us",
    },
  };
}

/**
 * Validates a lavalink node configuration
 * @param {object} node - Node configuration object
 * @returns {boolean} Whether the node config is valid
 */
function isValidNode(node) {
  if (!node || typeof node !== "object") return false;
  if (!node.host || typeof node.host !== "string" || !node.host.trim()) return false;
  if (!node.port || typeof node.port !== "number" || node.port < 1 || node.port > 65535) return false;
  if (!node.password || typeof node.password !== "string") return false;
  return true;
}

// Sort nodes by priority (lower priority = higher preference)
const sortedNodes = lavaConfig.nodes.sort(
  (a, b) => (a.priority || 1) - (b.priority || 1),
);

// Convert nodes to Shoukaku format, filtering out invalid nodes
const lavalinkNodes = sortedNodes
  .filter((node) => isValidNode(node))
  .map((node) => ({
    name: node.name || `node-${node.host}:${node.port}`,
    url: `${node.host}:${node.port}`,
    auth: node.password,
    secure: node.secure || false,
  }));

export class Manager {
  static {
    this.init = (client) => {
      // Check if there are valid nodes before initializing
      if (lavalinkNodes.length === 0) {
        client.log("No valid Lavalink nodes configured in lava.json. Music features will be unavailable.", "error");
      } else {
        client.log(`Initializing Lavalink with ${lavalinkNodes.length} node(s): ${lavalinkNodes.map(n => n.name).join(", ")}`, "info");
      }

      const manager = new Kazagumo(
        {
          plugins: [
            new deezer(),
            new apple(lavaConfig.appleConfig),
            new spotify(lavaConfig.spotifyConfig),
            new Plugins.PlayerMoved(client),
          ],
          defaultSearchEngine: lavaConfig.defaultSearchEngine,
          send: (guildId, payload) =>
            client.guilds.cache.get(guildId)?.shard.send(payload),
        },
        new Connectors.DiscordJS(client),
        lavalinkNodes,
        {
          userAgent: `@painfuego/fuego/v1.0.0/21_N-2K021-ST`,
          reconnectTries: 5,
          reconnectInterval: 5000,
          restTimeout: 60000,
          moveOnDisconnect: true,
        },
      );

      manager.on("playerStuck", async (player, data) => {
        client.log(`Player stuck in guild ${player.guildId}: ${data?.threshold || "unknown"}ms threshold`, "warn");
        await player.destroy();
      });

      manager.on("playerException", async (player, error) => {
        client.log(`Player exception in guild ${player.guildId}: ${error?.message || "Unknown error"}`, "error");
        await player.destroy();
      });

      manager.on("playerStart", (...args) =>
        client.emit("trackStart", ...args),
      );
      manager.on("playerDestroy", (...args) =>
        client.emit("playerDestroy", ...args),
      );

      // Enhanced Lavalink node connection handling with fallback
      manager.shoukaku.on("error", (name, error) => {
        const errorMsg = typeof error === "object" ? (error.message || JSON.stringify(error)) : String(error);
        client.log(`Lavalink node ${name} error: ${errorMsg}`, "error");
      });

      manager.shoukaku.on("ready", (name) => {
        client.log(`Lavalink node connected: ${name}`, "success");
      });

      manager.shoukaku.on("close", (name, code, reason) => {
        client.log(`Lavalink node ${name} closed with code ${code}: ${reason || "No reason provided"}`, "warn");
      });

      manager.shoukaku.on("disconnect", (name, reason) => {
        const reasonStr = typeof reason === "object" ? JSON.stringify(reason) : String(reason || "Unknown");
        client.log(`Lavalink node ${name} disconnected: ${reasonStr}`, "warn");

        // Check if there are other available nodes
        const availableNodes = [...manager.shoukaku.nodes.values()].filter(
          (n) => n.state === 2,
        );
        if (availableNodes.length > 0) {
          client.log(`Switching to backup node: ${availableNodes[0].name}`, "info");
        } else {
          client.log("All Lavalink nodes are disconnected. Music playback unavailable.", "error");
        }
      });

      manager.shoukaku.on("reconnecting", (name, tries, delay) => {
        client.log(`Reconnecting to ${name} (attempt ${tries}, delay ${delay}ms)`, "info");
      });

      // track end
      manager.on("playerEnd", async (player) => {
        try {
          await player.data.get("playEmbed")?.delete();
        } catch {
          // Ignore errors when deleting play embed (message might be already deleted)
        }
      });
      // queue end
      manager.on("playerEmpty", async (player) =>
        player.data.get("autoplayStatus")
          ? await autoplay(client, player)
          : await player.destroy(),
      );

      return manager;
    };
  }
}
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
