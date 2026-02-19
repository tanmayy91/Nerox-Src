/**
 * @nerox v1.0.0
 * @author Tanmay
 */
import { log } from "../../logger.js";
const handleCrash = (type, ...args) => {
  const err = `${args[0]}`.toLowerCase();
  if (err.includes("unknown message") || err.includes("already destroyed")) {
    return;
  }
  log(`[ Anti-Crash ] - ${type} - ${args[0]}:`, "error");
  console.error(...args);
};
export const loadAntiCrash = () => {
  log("[ Anti-Crash ] is now LIVE checking over crashes", "success");
  process.on("uncaughtException", (...args) =>
    handleCrash("UncaughtException", ...args),
  );
  process.on("unhandledRejection", (...args) =>
    handleCrash("UnhandledRejection", ...args),
  );
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
