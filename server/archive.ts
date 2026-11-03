import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { ArchiveFile } from "../src/archive";

export async function checkpointFiles(
  directory?: string,
): Promise<ArchiveFile[]> {
  if (!directory) return [];
  const name = basename(directory);
  if (
    !/^live-batch-\d+$/.test(name) ||
    resolve(directory) !== resolve("data", name)
  ) {
    throw new Error("Invalid checkpoint directory.");
  }
  const folder = resolve("data", name);
  const files = (await readdir(folder))
    .filter((name) => /^[a-zA-Z0-9-]+\.json$/.test(name))
    .sort();
  const result: ArchiveFile[] = [];
  for (const file of files) {
    result.push({
      name: `live-run/${name}/${file}`,
      content: await readFile(resolve(folder, file), "utf8"),
    });
  }
  return result;
}
