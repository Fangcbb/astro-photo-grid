import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import sharp from "sharp";

const exec = promisify(execFile);
const script = path.resolve("scripts/prepare-portfolio.mjs");
test("image pipeline rotates, removes EXIF, prevents upscaling and produces only display WebP", async (t) => {
  const cwd = await mkdtemp(path.join(tmpdir(), "portfolio-media-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(path.join(cwd, "src/images"), { recursive: true });
  await mkdir(path.join(cwd, "content"));
  await sharp({
    create: { width: 40, height: 20, channels: 3, background: "red" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toFile(path.join(cwd, "src/images/photo.jpg"));
  const catalog = {
    albums: [{ slug: "test", title: "测试" }],
    photos: [
      {
        slug: "photo",
        title: "测试",
        alt: "红色画面",
        album: "test",
        file: "photo.jpg",
      },
    ],
  };
  await writeFile(
    path.join(cwd, "content/portfolio.json"),
    JSON.stringify(catalog),
  );
  const env = { ...process.env, PORTFOLIO_SOURCE: "local" };
  await exec(process.execPath, [script], { cwd, env });
  const first = await readFile(
    path.join(cwd, ".portfolio/catalog.json"),
    "utf8",
  );
  const { photos } = JSON.parse(first);
  assert.equal(photos[0].width, 20);
  assert.equal(photos[0].height, 40);
  assert.equal(photos[0].srcset.split(", ").length, 1);
  const metadata = await sharp(
    path.join(cwd, "public", photos[0].src),
  ).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 20);
  assert.equal(metadata.height, 40);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
  assert.ok(!first.includes("photo.jpg"));
  await exec(process.execPath, [script], { cwd, env });
  assert.equal(
    await readFile(path.join(cwd, ".portfolio/catalog.json"), "utf8"),
    first,
  );
  const output = path.join(cwd, "public", photos[0].src);
  const intact = await readFile(output);
  await writeFile(output, "corrupt output");
  await exec(process.execPath, [script], { cwd, env });
  assert.deepEqual(
    await readFile(output),
    intact,
    "checksum mismatch repairs corrupt cached image",
  );
  catalog.photos[0].file = "../../../outside.jpg";
  await writeFile(
    path.join(cwd, "content/portfolio.json"),
    JSON.stringify(catalog),
  );
  await assert.rejects(exec(process.execPath, [script], { cwd, env }));
  assert.equal(
    await readFile(path.join(cwd, ".portfolio/catalog.json"), "utf8"),
    first,
    "failed refresh preserves last successful catalog",
  );
});
