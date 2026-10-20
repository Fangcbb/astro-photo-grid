import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadProjectEnvironment,
  validateSiteUrl,
} from "../scripts/environment.mjs";

test("CMS build configuration overrides local defaults while explicit process overrides remain authoritative", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "portfolio-env-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    path.join(directory, ".env"),
    'PORTFOLIO_SOURCE=local\nSITE_URL="https://photos.example.com"\n',
  );
  await writeFile(
    path.join(directory, ".env.build"),
    "PORTFOLIO_SOURCE=directus\nDIRECTUS_TOKEN=test-only-token\n",
  );
  const values = loadProjectEnvironment(directory, {});
  assert.equal(values.PORTFOLIO_SOURCE, "directus");
  assert.equal(values.SITE_URL, "https://photos.example.com");
  assert.equal(values.DIRECTUS_TOKEN, "test-only-token");
  const explicit = loadProjectEnvironment(directory, {
    PORTFOLIO_SOURCE: "local",
    DIRECTUS_TOKEN: "override",
  });
  assert.equal(explicit.PORTFOLIO_SOURCE, "local");
  assert.equal(explicit.DIRECTUS_TOKEN, "override");
});

test("publication accepts HTTP IP addresses and HTTPS domains", () => {
  assert.equal(
    validateSiteUrl("http://203.0.113.10:8080").origin,
    "http://203.0.113.10:8080",
  );
  assert.equal(
    validateSiteUrl("https://photos.example.com").protocol,
    "https:",
  );
  for (const value of [
    undefined,
    "http://photos.example.com",
    "http://127.0.0.1",
    "http://0.0.0.0",
    "https://localhost",
    "https://[::1]",
    "ftp://203.0.113.10",
    "https://user:pass@photos.example.com",
    "https://photos.example.com/?token=x",
    "https://photos.example.com/#photo",
    "https://photos.example.com/subpath",
  ]) {
    assert.throws(() => validateSiteUrl(value));
  }
});
