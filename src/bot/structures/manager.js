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

// Default fallback nodes for when lava.json is empty or invalid
const DEFAULT_NODES = [
  {
    name: "fallback-node",
    host: "lavalink.jirayu.net",
    port: 13592,
    password: "youshallnotpass",
    secure: false,
    priority: 1,
  },
];

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
    nodes: DEFAULT_NODES,
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

// Sort nodes by priority (lower priority = higher preference)
const sortedNodes = (lavaConfig.nodes || []).sort(
  (a, b) => (a.priority || 1) - (b.priority || 1),
);

// Convert nodes to Shoukaku format, skipping nodes with empty hosts
let lavalinkNodes = sortedNodes
  .filter((node) => node.host && node.host.trim() !== "" && node.port)
  .map((node) => ({
    name: node.name,
    url: `${node.host}:${node.port}`,
    auth: node.password || "",
    secure: node.secure || false,
  }));

// If no valid nodes found, use default fallback nodes
if (lavalinkNodes.length === 0) {
  console.warn("No valid Lavalink nodes in lava.json, using fallback nodes");
  lavalinkNodes = DEFAULT_NODES.map((node) => ({
    name: node.name,
    url: `${node.host}:${node.port}`,
    auth: node.password || "",
    secure: node.secure || false,
  }));
}

export class Manager {
  static {
    this.init = (client) => {
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
          userAgent: `Nerox/v1.0.0`,
          reconnectTries: 10,
          reconnectInterval: 5000,
          restTimeout: 60000,
          moveOnDisconnect: true,
          resume: true,
          resumeTimeout: 30,
          resumeByLibrary: true,
        },
      );

      manager.on("playerStuck", async (player) => await player.destroy());
      manager.on("playerException", async (player) => await player.destroy());
      manager.on("playerStart", (...args) =>
        client.emit("trackStart", ...args),
      );
      manager.on("playerDestroy", (...args) =>
        client.emit("playerDestroy", ...args),
      );

      // Enhanced Lavalink node connection handling with fallback
      manager.shoukaku.on("error", (name, error) => {
        const errorMsg = error?.message || JSON.stringify(error) || "Unknown error";
        client.log(`Lavalink node ${name} error: ${errorMsg}`, "error");
      });

      manager.shoukaku.on("ready", (name) => {
        client.log(`Lavalink node: ${name} connected successfully`, "success");
      });

      manager.shoukaku.on("disconnect", (name, reason) => {
        const reasonStr = typeof reason === "object" ? JSON.stringify(reason) : reason;
        client.log(`Lavalink node ${name} disconnected: ${reasonStr}`, "warn");

        // Check if there are other available nodes
        const availableNodes = [...manager.shoukaku.nodes.values()].filter(
          (n) => n.state === 2,
        );
        if (availableNodes.length > 0) {
          client.log(
            `Switching to backup node: ${availableNodes[0].name}`,
            "info",
          );
        } else {
          client.log("All Lavalink nodes are disconnected!", "error");
        }
      });

      manager.shoukaku.on("reconnecting", (name, tries, delay) => {
        client.log(
          `Reconnecting to ${name} (attempt ${tries}, delay ${delay}ms)`,
          "info",
        );
      });

      manager.shoukaku.on("close", (name, code, reason) => {
        client.log(
          `Lavalink node ${name} connection closed (code: ${code}, reason: ${reason || "none"})`,
          "warn",
        );
      });

      // track end
      manager.on("playerEnd", async (player) => {
        try {
          await player.data.get("playEmbed")?.delete();
        } catch (err) {
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
