import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { loadProjectEnvironment, validateSiteUrl } from "./environment.mjs";

loadProjectEnvironment();
validateSiteUrl(process.env.SITE_URL);
await mkdir(".publish/releases", { recursive: true });
// The Nginx worker must be able to traverse bind-mounted releases, even under umask 077.
await chmod(".publish", 0o755);
await chmod(".publish/releases", 0o755);
async function readable(directory) {
  await chmod(directory, 0o755);
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const entry = `${directory}/${item.name}`;
    if (item.isDirectory()) await readable(entry);
    else if (item.isFile()) await chmod(entry, 0o644);
    else throw new Error("Unexpected non-file in static output");
  }
}
const lock = await open(".publish/publish.lock", "wx");
const release = `releases/${Date.now()}-${randomBytes(4).toString("hex")}`;
try {
  for (const args of [
    ["portfolio:prepare"],
    ["exec", "astro", "check"],
    ["exec", "astro", "build", "--outDir", `.publish/${release}`],
  ]) {
    const result = spawnSync("pnpm", args, {
      stdio: "inherit",
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    });
    if (result.error || result.status !== 0)
      throw new Error(`Publish stopped: ${args.join(" ")} failed`);
  }
  await readable(`.publish/${release}`);
  // Relative links resolve inside both the host and the Nginx bind mount.
  const { symlink } = await import("node:fs/promises");
  await symlink(release, ".publish/next");
  await rename(".publish/next", ".publish/current");
  await writeFile(".publish/last-release.txt", `${release}\n`);
  console.log(
    "Published static release atomically. Older releases remain available for manual rollback.",
  );
} finally {
  await lock.close();
  await rm(".publish/publish.lock", { force: true });
}
