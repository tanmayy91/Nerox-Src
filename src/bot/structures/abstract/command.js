export class Command {
  constructor() {
    this.usage = "";
    this.nsfw = false;
    this.admin = false; // Bot Admin Only
    this.owner = false; // Bot Owner Only
    this.mod = false; // Bot Mod Only
    this.staff = false; // Bot Staff Only
    this.serveradmin = false; // Server Admin Only
    this.serverStaff = false; // Server Staff Only
    this.inVC = false; // User must be in a Voice Channel
    this.inSameVC = false; // User must be in the same VC as the bot
    this.player = false; // Requires a music player
    this.playing = false; // Requires music to be playing
    this.cooldown = 5; // Default cooldown in seconds
    this.aliases = []; // Command Aliases
    this.slash = true; // Slash command support
    this.options = []; // Command options (for slash commands)
    this.userPerms = []; // User permissions required
    this.botPerms = []; // Bot permissions required
    /** Assigned dynamically when loading ( `file.name.toLowerCase()` ) */
    this.name = "";
    /** Assigned dynamically when loading ( `folder.name.toLowerCase()` ) */
    this.category = "";
  }
}
/** @codeStyle - https://google.github.io/styleguide/tsguide.html */
