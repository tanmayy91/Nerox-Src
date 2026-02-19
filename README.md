# Nerox 🎵

A feature-rich Discord music bot built with Discord.js v14 and powered by Lavalink for high-quality music streaming.

## ✨ Features

- 🎶 High-quality music playback from multiple sources (YouTube, Spotify, Apple Music, Deezer)
- 🔊 Advanced audio controls and queue management
- 🎮 Built-in Discord games via discord-gamecord
- 🎁 Giveaway system
- 🌐 Translation support
- 📊 Database integration with MongoDB
- 🎨 Custom music cards and visualizations
- 🔐 Role-based access control (Owner/Admin)
- ⚡ Hybrid sharding support for scaling
- 📝 Comprehensive logging system

## 📋 Prerequisites

- Node.js ≥ 20.x.x
- MongoDB database
- Lavalink server(s) for music playback
- Discord bot token
- Spotify API credentials (for Spotify playback)

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/tanmayy91/Nerox-Src.git
   cd Nerox-Src
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   
   Copy `example.env` to `.env` and fill in your configuration:
   ```bash
   cp example.env .env
   ```

   Required environment variables:
   - `DISCORD_TOKEN` - Your Discord bot token from [Discord Developer Portal](https://discord.com/developers/applications)
   - `OWNER_IDS` - Comma-separated Discord user IDs with full bot access
   - `ADMIN_IDS` - Comma-separated Discord user IDs with admin access
   - `PREFIX` - Command prefix (default: `&`)
   - `SUPPORT_SERVER` - Discord invite link to your support server
   - `BACKUP_CHANNEL` - Channel ID for database backups
   - `IV` and `KEY` - Encryption keys (optional, generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)

4. **Configure Lavalink**
   
   Edit `lava.json` with your Lavalink server details:
   ```json
   {
     "nodes": [
       {
         "name": "primary-node",
         "host": "your-lavalink-host",
         "port": 6969,
         "password": "your-password",
         "secure": false,
         "priority": 1
       }
     ]
   }
   ```

5. **Configure webhooks**
   
   > ⚠️ **Important:** Make sure to add your server ID in `src/lib/services/setupWebhooks.js` before running the bot.

6. **Build and run**
   ```bash
   npm run build
   npm start
   ```

## 📜 Available Scripts

- `npm start` - Start the bot in production mode
- `npm run dev` - Run linting, formatting, build, and start (development mode)
- `npm run build` - Compile TypeScript to JavaScript
- `npm run lint` - Run ESLint code checks
- `npm run format` - Format code with Prettier
- `npm run deploy` - Full deployment (install, build, and start)

## 🏗️ Project Structure

```
Nerox-Src/
├── src/
│   ├── assets/      # Static assets (images, fonts, etc.)
│   ├── bot/         # Bot core functionality
│   ├── lib/         # Utility libraries
│   ├── system/      # System components
│   ├── index.js     # Main entry point
│   ├── nerox.js     # Bot client setup
│   └── logger.js    # Logging system
├── dokdo/           # Dokdo (eval command) configuration
├── lava.json        # Lavalink configuration
├── example.env      # Environment variables template
└── package.json     # Project dependencies
```

## 🎵 Music Playback

Nerox uses the Kazagumo library (built on Shoukaku) for music playback, with support for:
- YouTube (default search engine)
- Spotify (with playlist and album support)
- Apple Music
- Deezer

## 🛠️ Tech Stack

- **Discord.js v14** - Discord API wrapper
- **Kazagumo** - Lavalink wrapper for music playback
- **Shoukaku** - Low-level Lavalink client
- **Mongoose** - MongoDB object modeling
- **Express** - Web server framework
- **TypeScript** - Type-safe development
- **Canvas** - Image generation
- **Discord Hybrid Sharding** - Scalability support

## ⚠️ Important Notes

- This bot is intended **for educational and demonstration purposes**
- Requires a properly configured Lavalink server for music functionality
- MongoDB connection is required for database features
- Node.js version 20 or higher is required
- **Don't forget to add your server ID in `src/lib/services/setupWebhooks.js`**

## 📝 License

Currently unlicensed - see `package.json` for details.

## 👤 Author

**tanmay**

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!


---
