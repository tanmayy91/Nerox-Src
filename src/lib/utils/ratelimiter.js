import { RateLimitManager } from "@sapphire/ratelimits";
const manager = new RateLimitManager(5000, 7);
export const limited = (key) => {
  if (manager.acquire(key).limited) {
    return true;
  }
  manager.acquire(key).consume();
  return false;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
