/**
 * Database utility functions for Josh DB operations.
 * Provides consistent methods for common database operations across the codebase.
 */

/**
 * Get all entries from a Josh collection as a key-value object.
 * Josh doesn't have an entries() method, so we use filter(() => true)
 * and convert the result to an object format.
 *
 * @param {object} collection - The Josh collection instance.
 * @returns {Promise<Record<string, unknown>>} Object containing all key-value pairs.
 */
export async function getAllEntries(collection) {
  if (!collection || typeof collection.filter !== "function") {
    return {};
  }
  const entries = await collection.filter(() => true);
  return Object.fromEntries(entries);
}

/**
 * Get all keys from a Josh collection.
 *
 * @param {object} collection - The Josh collection instance.
 * @returns {Promise<string[]>} Array of all keys.
 */
export async function getAllKeys(collection) {
  if (!collection) return [];
  return await collection.keys;
}

/**
 * Get all values from a Josh collection.
 *
 * @param {object} collection - The Josh collection instance.
 * @returns {Promise<unknown[]>} Array of all values.
 */
export async function getAllValues(collection) {
  if (!collection) return [];
  return await collection.values;
}

/**
 * Get the count of entries in a Josh collection.
 *
 * @param {object} collection - The Josh collection instance.
 * @returns {Promise<number>} Number of entries.
 */
export async function getCount(collection) {
  if (!collection) return 0;
  return await collection.size;
}

/**
 * Safely get a value from a Josh collection with a default.
 *
 * @param {object} collection - The Josh collection instance.
 * @param {string} key - The key to retrieve.
 * @param {unknown} defaultValue - Default value if key doesn't exist.
 * @returns {Promise<unknown>} The value or default.
 */
export async function safeGet(collection, key, defaultValue = null) {
  if (!collection || !key) return defaultValue;
  try {
    const value = await collection.get(key);
    return value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Safely check if a key exists in a Josh collection.
 *
 * @param {object} collection - The Josh collection instance.
 * @param {string} key - The key to check.
 * @returns {Promise<boolean>} Whether the key exists.
 */
export async function safeHas(collection, key) {
  if (!collection || !key) return false;
  try {
    return await collection.has(key);
  } catch {
    return false;
  }
}
