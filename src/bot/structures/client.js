import moment from "moment";
import { readdirSync } from "fs";
import { Manager } from "./manager.js";
import { fileURLToPath } from "node:url";
import { emoji } from "../../assets/emoji.js";
import format from "moment-duration-format";
import { josh } from "../../lib/services/josh.js";
import { log } from "../../logger.js";
import { dirname, resolve } from "node:path";
import { ExtendedEmbedBuilder } from "./embed.js";
import { ExtendedButtonBuilder } from "./button.js";
import { OAuth2Scopes } from "discord-api-types/v10";
import { readyEvent } from "../../lib/services/readyEvent.js";
import {
  Client,
  Partials,
  Collection,
  GatewayIntentBits,
  WebhookClient,
} from "discord.js";
import { ClusterClient, getInfo } from "discord-hybrid-sharding";
import { config } from "./config.js"; // 🔥 Now loads config directly

format(moment);
const __dirname = dirname(fileURLToPath(import.meta.url));

export class ExtendedClient extends Client {
  constructor() {
    super({
      partials: [
        Partials.User,
        Partials.Channel,
        Partials.Message,
        Partials.Reaction,
        Partials.GuildMember,
        Partials.ThreadMember,
        Partials.GuildScheduledEvent,
      ],
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildInvites,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions,
      ],
      failIfNotExists: false,
      shards: getInfo().SHARD_LIST,
      shardCount: getInfo().TOTAL_SHARDS,
      allowedMentions: {
        repliedUser: false,
        parse: ["users", "roles"],
      },
    });

    this.emoji = emoji;
    this.config = config;
    this.webhooks = {}; // Will be initialized in ready event
    this.manager = Manager.init(this);
    this.underMaintenance = false;
    this.prefix = config.prefix || "&";
    this.owners = config.owners;
    this.admins = config.admins;

    this.db = {
      noPrefix: josh("noPrefix"),
      ticket: josh("ticket"),
      botmods: josh("botmods"),
      giveaway: josh("giveaway"),
      mc: josh("msgCount"),
      botstaff: josh("botstaff"), // Bot premium users
      redeemCode: josh("redeemCode"),
      serverstaff: josh("serverstaff"), // Server premium
      ignore: josh("ignore"),
      bypass: josh("bypass"),
      blacklist: josh("blacklist"),
      config: josh("config"), // Bot configuration (webhooks, etc.)
      prefix: josh("prefix"), // Guild-specific prefixes
      afk: josh("afk"), // AFK status
      spotify: josh("spotify"), // Spotify user data
      likedSongs: josh("likedSongs"), // User liked songs
      userPreferences: josh("userPreferences"), // User preferences (search engine, etc.)

      stats: {
        songsPlayed: josh("stats/songsPlayed"),
        commandsUsed: josh("stats/commandsUsed"),
        friends: josh("stats/friends"), // Friends list
      },
      twoFourSeven: josh("twoFourSeven"),
    };

    this.dokdo = null;

    this.invite = {
      admin: () =>
        this.generateInvite({
          scopes: [OAuth2Scopes.Bot],
          permissions: ["Administrator"],
        }),
      required: () =>
        this.generateInvite({
          scopes: [OAuth2Scopes.Bot],
          permissions: [
            "ViewChannel",
            "SendMessages",
            "EmbedLinks",
            "AttachFiles",
            "ReadMessageHistory",
            "AddReactions",
            "Connect",
            "Speak",
            "UseVAD",
          ],
        }),
    };

    this.cluster = new ClusterClient(this);
    this.commands = new Collection();
    this.categories = readdirSync(resolve(__dirname, "../commands"));
    this.cooldowns = new Collection();

    this.connectToGateway = () => (this.login(config.token), this);

    this.log = (message, type) => void log(message, type);
    this.sleep = async (s) =>
      void (await new Promise((resolve) => setTimeout(resolve, s * 1000)));

    this.button = () => new ExtendedButtonBuilder();
    this.embed = (color) => new ExtendedEmbedBuilder(color || "#000000");

    this.formatBytes = (bytes) => {
      const power = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${parseFloat((bytes / Math.pow(1024, power)).toFixed(2))} ${
        ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"][power]
      }`;
    };

    this.formatDuration = (duration) =>
      moment
        .duration(duration, "milliseconds")
        .format("d[d] h[h] m[m] s[s]", 0, {
          trim: "all",
        });

    this.getPlayer = (ctx) => this.manager.players.get(ctx.guild.id);

    // Webhooks are initialized in ready event after setupWebhooks

    this.on("debug", (data) => this.log(data));
    this.on("ready", async () => await readyEvent(this));
    this.on("messageUpdate", (_, m) =>
      m.partial ? null : this.emit("messageCreate", m),
    );
  }
}
