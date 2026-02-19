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

// Sort nodes by priority (lower priority = higher preference)
const sortedNodes = lavaConfig.nodes.sort(
  (a, b) => (a.priority || 1) - (b.priority || 1),
);

// Convert nodes to Shoukaku format
const lavalinkNodes = sortedNodes.map((node) => ({
  name: node.name,
  url: `${node.host}:${node.port}`,
  auth: node.password,
  secure: node.secure || false,
}));

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
          userAgent: `@painfuego/fuego/v1.0.0/21_N-2K021-ST`,
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
        client.log(
          `Lavalink node ${name} error: ${JSON.stringify(error)}`,
          "error",
        );
      });

      manager.shoukaku.on("ready", (name) => {
        client.log(
          `✅ Lavalink node: ${name} connected successfully`,
          "success",
        );
      });

      manager.shoukaku.on("disconnect", (name, reason) => {
        client.log(`⚠️ Lavalink node ${name} disconnected: ${reason}`, "warn");

        // Check if there are other available nodes
        const availableNodes = [...manager.shoukaku.nodes.values()].filter(
          (n) => n.state === 2,
        );
        if (availableNodes.length > 0) {
          client.log(
            `🔄 Switching to backup node: ${availableNodes[0].name}`,
            "info",
          );
        } else {
          client.log("❌ All Lavalink nodes are disconnected!", "error");
        }
      });

      manager.shoukaku.on("reconnecting", (name, tries, delay) => {
        client.log(
          `🔄 Reconnecting to ${name} (attempt ${tries}, delay ${delay}ms)`,
          "info",
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
