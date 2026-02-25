/**
 * @nerox v1.0.0
 * @author Tanmay
 * @copyright 2024 Nerox - Services
 */

import { loadAntiCrash } from "./lib/utils/anticrash.js";
import { ExtendedClient } from "./bot/structures/client.js";
import { startApiServer } from "./lib/services/apiServer.js";

console.clear();

// Load anti-crash handler
loadAntiCrash();

// Initialize and connect the client
const client = new ExtendedClient();

// Start the REST API server for external dashboard access
startApiServer(client);

export default client.connectToGateway();
