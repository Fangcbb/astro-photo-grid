// Run ONLY against an isolated local CMS with DIRECTUS_ADMIN_TOKEN and DIRECTUS_URL.
// Example: node --env-file=/secure/test-admin.env tests/cms.integration.mjs
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { admin, config } from "../scripts/directus-admin.mjs";

const exec = promisify(execFile);
const root = process.cwd();
if (!["localhost", "127.0.0.1"].includes(new URL(config.url).hostname))
  throw new Error("Integration test requires a disposable localhost CMS");
const cwd = await mkdtemp(path.join(tmpdir(), "portfolio-cms-"));
const createdPhotos = [];
const createdAlbums = [];
let file;
let buildUser;
let buildPolicy;
const key = `integration-${randomBytes(4).toString("hex")}`;
try {
  for (const status of ["published", "draft"]) {
    const album = await admin("/items/albums", "POST", {
      title: `Test ${status}`,
      slug: `${key}-${status}`,
      status,
    });
    createdAlbums.push(album.id);
  }
  const bytes = await sharp({
    create: { width: 480, height: 320, channels: 3, background: "#456789" },
  })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append(
    "file",
    new Blob([bytes], { type: "image/jpeg" }),
    "integration.jpg",
  );
  const upload = await fetch(`${config.url}/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}` },
    body: form,
  });
  assert.equal(upload.status, 200, "real CMS image upload");
  file = (await upload.json()).data.id;
  for (const [i, status, album] of [
    [1, "published", createdAlbums[0]],
    [2, "draft", createdAlbums[0]],
    [3, "published", createdAlbums[1]],
  ]) {
    const photo = await admin("/items/photos", "POST", {
      title: `Test <script>alert(1)</script> ${i}`,
      slug: `${key}-${i}`,
      alt: "测试作品 & 描述",
      status,
      album,
      file,
      taken_at: "2024-02-29",
    });
    createdPhotos.push(photo.id);
  }
  await exec(
    process.execPath,
    [path.join(root, "scripts/create-build-token.mjs")],
    { cwd, env: process.env },
  );
  const saved = Object.fromEntries(
    (await readFile(path.join(cwd, ".env.build"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
  const headers = { Authorization: `Bearer ${saved.DIRECTUS_TOKEN}` };
  const me = await fetch(`${config.url}/users/me?fields=id`, { headers });
  buildUser = (await me.json()).data.id;
  const access = await admin(`/access?filter[user][_eq]=${buildUser}`);
  buildPolicy = access[0].policy;
  const response = await fetch(`${config.url}/items/photos`, { headers });
  assert.equal(response.status, 200);
  const visible = (await response.json()).data.filter((p) =>
    p.slug.startsWith(key),
  );
  assert.equal(visible.length, 2, "read policy filters draft photos");
  const denied = await fetch(`${config.url}/items/photos`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "forbidden" }),
  });
  assert.equal(denied.status, 403, "build token cannot write");
  const anon = await fetch(`${config.url}/assets/${file}`);
  assert.equal(anon.status, 403, "originals remain private");
  const env = {
    ...process.env,
    ...saved,
    ASTRO_TELEMETRY_DISABLED: "1",
    SITE_URL: "https://photos.example.com",
  };
  await exec(process.execPath, ["scripts/prepare-portfolio.mjs"], {
    cwd: root,
    env,
  });
  const catalog = JSON.parse(await readFile(".portfolio/catalog.json", "utf8"));
  assert.deepEqual(
    catalog.photos.filter((p) => p.slug.startsWith(key)).map((p) => p.slug),
    [`${key}-1`],
    "unpublished album is excluded",
  );
  await exec(
    process.env.PNPM_BIN || "pnpm",
    ["exec", "astro", "build", "--outDir", ".portfolio/integration-dist"],
    { cwd: root, env },
  );
  const html = await readFile(
    `.portfolio/integration-dist/photos/${key}-1/index.html`,
    "utf8",
  );
  assert.ok(html.includes("&lt;script&gt;"), "metadata is escaped");
  assert.ok(
    !html.match(/<title>([\s\S]*?)<\/title>/)?.[1].includes("<script>"),
  );
  assert.ok(!html.includes("<h1>Test <script>"));
  assert.ok(
    !html.includes(saved.DIRECTUS_TOKEN),
    "no build secret in generated page",
  );
  // An empty published catalog must also build and show the empty state.
  await admin(`/items/photos/${createdPhotos[0]}`, "PATCH", {
    status: "draft",
  });
  await exec(process.execPath, ["scripts/prepare-portfolio.mjs"], {
    cwd: root,
    env,
  });
  await exec(
    process.env.PNPM_BIN || "pnpm",
    ["exec", "astro", "build", "--outDir", ".portfolio/empty-dist"],
    { cwd: root, env },
  );
  const empty = await readFile(".portfolio/empty-dist/index.html", "utf8");
  assert.ok(empty.includes("作品正在整理中"));
  console.log(
    "PASS: CMS upload, read-only token, draft isolation, private originals, escaped metadata, static CMS build and empty-catalog build.",
  );
} finally {
  for (const id of createdPhotos) await admin(`/items/photos/${id}`, "DELETE");
  for (const id of createdAlbums) await admin(`/items/albums/${id}`, "DELETE");
  if (file) await admin(`/files/${file}`, "DELETE");
  if (buildUser) await admin(`/users/${buildUser}`, "DELETE");
  if (buildPolicy) await admin(`/policies/${buildPolicy}`, "DELETE");
  await rm(cwd, { recursive: true, force: true });
}
