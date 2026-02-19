import { createWriteStream } from "node:fs";
import archiver from "archiver";
import { readdir, stat, unlink, access } from "node:fs/promises";
import {
  resolve,
  join,
  relative,
  extname,
  normalize,
  basename,
} from "node:path";
const ignorableExtensions = [".zip", ".jar"];
const excludes = ["logs", "node_modules"];
const resolvedDirectoryPath = resolve("./");
const excludesNormalized = excludes.map((element) => normalize(element));
const ignorableExtensionsSet = new Set(
  ignorableExtensions.map((ext) => ext.toLowerCase()),
);
const shouldExclude = (filePath) => {
  const relativePath = relative(resolvedDirectoryPath, filePath);
  return (
    ignorableExtensionsSet.has(extname(filePath).toLowerCase()) ||
    excludesNormalized.includes(relativePath) ||
    basename(relativePath).startsWith(".")
  );
};
const traverseDirectoryTree = async (currentPath, archive) => {
  for (const entry of await readdir(currentPath)) {
    const elementPath = join(resolve(currentPath), entry);
    const element = await stat(elementPath);
    if (element.isFile() && !shouldExclude(elementPath)) {
      archive.file(elementPath, {
        name: relative(resolvedDirectoryPath, elementPath),
      });
    } else if (element.isDirectory() && !shouldExclude(elementPath)) {
      await traverseDirectoryTree(elementPath, archive);
    }
  }
};
export const zipper = async (zipPath) => {
  const resolvedZipPath = resolve(zipPath);
  await access(resolvedZipPath)
    .then(async () => await unlink(resolvedZipPath))
    .catch(() => null);
  const output = createWriteStream(resolvedZipPath);
  const archive = archiver("zip", {
    zlib: { level: 9 },
  });
  //@ts-expect-error issues doe to node versions while compiling but fine at runtime
  archive.pipe(output);
  await traverseDirectoryTree(resolvedDirectoryPath, archive);
  await archive.finalize();
  await new Promise((resolve) => {
    output.on("close", () => resolve());
  });
  return resolvedZipPath;
};
/**@codeStyle - https://google.github.io/styleguide/tsguide.html */
