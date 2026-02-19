/**
 * @nerox v1.0.0
 * @author Tanmay
 */
import path from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
const options = {
  excludedFiles: [],
  excludedExtensions: ["log", "jar"],
  excludedDirectories: [
    "node_modules",
    "database-storage",
    "dokdo",
    "dist",
    "plugins",
  ],
};
export const getCodeStats = async () => {
  const stats = {
    files: 0,
    lines: 0,
    characters: 0,
    tree: ["root"],
    directories: 0,
    whitespaces: 0,
  };
  const traverse = async (entryPath, depth = 0) => {
    const entities = await readdir(entryPath);
    for (const entity of entities) {
      if (entity.startsWith(".")) continue;
      const entityPath = path.join(entryPath, entity);
      const entityIsDirectory = await stat(entityPath).then((stat) =>
        stat.isDirectory(),
      );
      if (options.excludedFiles.some((entry) => entity.includes(entry)))
        continue;
      if (options.excludedExtensions.some((entry) => entity.endsWith(entry)))
        continue;
      if (options.excludedDirectories.some((entry) => entity.includes(entry)))
        continue;
      if (entityIsDirectory) {
        stats.tree.push("│ ".repeat(depth) + entity);
        await traverse(path.join(entryPath, entity), depth + 1);
        stats.directories++;
        continue;
      }
      stats.files++;
      const [characters, lines, whitespaces] = await Promise.all([
        await readFile(entityPath, "utf8").then((content) => content.length),
        await readFile(entityPath, "utf8").then(
          (content) => content.split("\n").length,
        ),
        await readFile(entityPath, "utf8").then(
          (content) => (content.match(/\s/g) || []).length,
        ),
      ]);
      stats.lines += lines;
      stats.characters += characters;
      stats.whitespaces += whitespaces;
      const isLast = entities[entities.length - 1] === entity;
      stats.tree.push("│ ".repeat(depth) + (isLast ? "└ " : "├ ") + entity);
    }
  };
  await traverse(".");
  return stats;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
