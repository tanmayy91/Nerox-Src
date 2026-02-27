import { Client } from '../../../dokdo/index.js';
import { loadEvents } from '../../system/loaders/events.js';
import { loadCommands } from '../../system/loaders/msgCmds.js';
import { connect247 } from './connect247.js';
import { deploySlashCommands } from '../../system/loaders/slashCmds.js';
import { setupWebhooks } from './setupWebhooks.js';
import { initAutoBackup } from './autoBackup.js';

const SUPPORT_SERVER = 'https://discord.gg/p6nXDJMeyc';

const load247Players = async (client) => {
    const guildIds = await client.db.twoFourSeven.keys;
    let players = 0;

    client.log('Loading 24/7 players...', 'info');
    for (const guildId of guildIds) {
        const connected = await connect247(client, guildId);
        if (connected) players++;
    }

    client.log(`Loaded ${players} / ${guildIds.length} 24/7 players.`, 'success');
};

const checkPremiumExpiries = async (client) => {
    const now = Date.now();
    let expiredUsers = 0;
    let expiredServers = 0;

    // User Premium Expiry - check both 'expires' and 'expiresAt' for compatibility
    const userKeys = await client.db.botstaff.keys;
    for (const id of userKeys) {
        const data = await client.db.botstaff.get(id);
        // Skip if permanent
        if (data?.permanent) continue;
        const expiryTime = data?.expiresAt || data?.expires;
        if (expiryTime && expiryTime < now) {
            await client.db.botstaff.delete(id).catch(() => {});
            expiredUsers++;

            const user = await client.users.fetch(id).catch(() => null);
            if (user) {
                user.send({
                    embeds: [
                        client.embed('#FF6B6B')
                            .title('Premium Expired')
                            .desc(`Your **Nerox Premium** has expired.\n\nTo renew, click the button below or join our [Support Server](${SUPPORT_SERVER})`)
                            .footer({ text: 'Nerox Premium | Expired' })
                    ],
                    components: [
                        {
                            type: 1,
                            components: [
                                client.button().link('Renew Premium', SUPPORT_SERVER)
                            ]
                        }
                    ]
                }).catch(() => null);
            }

            client.log(`Expired user premium: ${id}`, 'warn');
        }
    }

    // Server Premium Expiry - check both 'expires' and 'expiresAt' for compatibility
    const serverKeys = await client.db.serverstaff.keys;
    for (const id of serverKeys) {
        const data = await client.db.serverstaff.get(id);
        // Skip if permanent
        if (data?.permanent) continue;
        const expiryTime = data?.expiresAt || data?.expires;
        if (expiryTime && expiryTime < now) {
            await client.db.serverstaff.delete(id).catch(() => {});
            expiredServers++;
            client.log(`Expired server premium: ${id}`, 'warn');
        }
    }

    if (expiredUsers) client.log(`Removed ${expiredUsers} expired user premiums.`, 'info');
    if (expiredServers) client.log(`Removed ${expiredServers} expired server premiums.`, 'info');
};

const checkNoPrefixExpiries = async (client) => {
    const now = Date.now();
    let expiredUsers = 0;

    // NoPrefix Expiry
    const noPrefixKeys = await client.db.noPrefix.keys;
    for (const id of noPrefixKeys) {
        const data = await client.db.noPrefix.get(id);

        // Skip legacy format (just true) - treat as permanent
        if (data === true) continue;

        // Skip if permanent
        if (data?.permanent) continue;

        // Check expiry
        const expiryTime = data?.expiresAt || data?.expires;
        if (expiryTime && expiryTime < now) {
            await client.db.noPrefix.delete(id).catch(() => {});
            expiredUsers++;

            const user = await client.users.fetch(id).catch(() => null);
            if (user) {
                user.send({
                    embeds: [
                        client.embed('#FF6B6B')
                            .title('No Prefix Expired')
                            .desc(`Your **No Prefix** access has expired.\n\nYou will now need to use the prefix \`${client.prefix}\` before commands.\n\nTo renew, join our [Support Server](${SUPPORT_SERVER})`)
                            .footer({ text: 'Nerox No Prefix | Expired' })
                    ],
                    components: [
                        {
                            type: 1,
                            components: [
                                client.button().link('Support Server', SUPPORT_SERVER)
                            ]
                        }
                    ]
                }).catch(() => null);
            }

            client.log(`Expired no-prefix: ${id}`, 'warn');
        }
    }

    if (expiredUsers) client.log(`Removed ${expiredUsers} expired no-prefix users.`, 'info');
};

export const readyEvent = async (client) => {
    client.user.setPresence({
        status: 'online',
        activities: [
            {
                type: 4,
                name: `${client.config.prefix}help`,
            },
        ],
    });

    client.log(`Logged in as ${client.user.tag} [${client.user.id}]`, 'success');

    // Setup webhooks from database or create them
    const webhookUrls = await setupWebhooks(client);
    if (webhookUrls) {
        const { WebhookClient } = await import('discord.js');
        client.webhooks = Object.fromEntries(
            Object.entries(webhookUrls).map(([hook, url]) => [
                hook,
                new WebhookClient({ url }),
            ])
        );
        client.log('Webhooks initialized successfully.', 'info');
    }

    // Event & Command Loaders
    await loadEvents(client);
    client.log('Events loaded.', 'info');

    await loadCommands(client);
    client.log('Message commands loaded.', 'info');

    await deploySlashCommands(client);
    client.log('Slash commands deployed.', 'info');

    // Expiry Checks
    await checkPremiumExpiries(client);
    await checkNoPrefixExpiries(client);

    // Dokdo Panel
    client.dokdo = new Client(client, {
        aliases: ['jsk'],
        prefix: client.prefix,
        owners: ['991517803700027443'],
    });

    // Stats
    const guildCount = client.guilds.cache.size;
    const userCount = {
        cached: client.users.cache.size,
        total: client.guilds.cache.reduce((total, guild) => total + guild.memberCount, 0),
    };

    client.log(`Ready in ${guildCount} guilds with ${userCount.total} users (${userCount.cached} cached).`, 'info');

    // Initialize automatic daily backup
    await initAutoBackup(client);

    // 24/7 Player Load - guard against empty nodes (no Lavalink nodes connected yet)
    const nodesArray = [...client.manager.shoukaku.nodes];
    if (nodesArray.length === 0) {
        client.log('No Lavalink nodes available yet, waiting for a node to connect...', 'warn');
        client.manager.shoukaku.once('ready', async () => await load247Players(client));
        return;
    }
    const node = nodesArray[0][1];
    if (node.state === 2) return await load247Players(client);
    client.manager.shoukaku.once('ready', async () => await load247Players(client));
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
