import { readFileSync } from "node:fs";
import { isIPv4 } from "node:net";
import path from "node:path";
import { parseEnv } from "node:util";

// Match Node's --env-file precedence: explicit process values > later file > earlier file.
export function loadProjectEnvironment(
  directory = process.cwd(),
  target = process.env,
) {
  const explicit = new Set(Object.keys(target));
  for (const filename of [".env", ".env.build"]) {
    let values;
    try {
      values = parseEnv(readFileSync(path.join(directory, filename), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    for (const [key, value] of Object.entries(values)) {
      if (!explicit.has(key)) target[key] = value;
    }
  }
  return target;
}

export function validateSiteUrl(value) {
  const message =
    "Set SITE_URL to your HTTPS website or an HTTP IPv4 address (including its port) before publishing";
  let site;
  try {
    site = new URL(value);
  } catch {
    throw new Error(message);
  }
  const allowed =
    site.protocol === "https:" ||
    (site.protocol === "http:" && isIPv4(site.hostname));
  if (
    !allowed ||
    site.username ||
    site.password ||
    site.search ||
    site.hash ||
    site.pathname !== "/" ||
    ["localhost", "localhost.", "0.0.0.0", "[::1]", "[::]"].includes(
      site.hostname,
    ) ||
    site.hostname.startsWith("127.")
  ) {
    throw new Error(message);
  }
  return site;
}
