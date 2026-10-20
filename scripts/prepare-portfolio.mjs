import {
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  cmsConfig,
  cmsRequest,
  loadDirectus,
  mediaKey,
  validateCatalog,
} from "../src/lib/catalog.mjs";

// This script intentionally owns only .portfolio/ and public/media/.
const root = process.cwd();
const mode = process.env.PORTFOLIO_SOURCE || "local";
if (!["local", "directus"].includes(mode))
  throw new Error("PORTFOLIO_SOURCE must be local or directus");
const config = mode === "directus" ? cmsConfig(process.env) : null;
const catalog = config
  ? await loadDirectus(config)
  : validateCatalog(
      JSON.parse(await readFile("content/portfolio.json", "utf8")),
    );
const out = path.join(root, "public/media");
await mkdir(out, { recursive: true });
await mkdir(".portfolio", { recursive: true });
let previousCache = {};
try {
  previousCache = JSON.parse(
    await readFile(".portfolio/media-cache.json", "utf8"),
  );
} catch (error) {
  if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
}
const nextCache = {};
const conversions = new Map();
async function prepareVariant(filename, bytes, width) {
  if (!conversions.has(filename))
    conversions.set(
      filename,
      (async () => {
        const destination = path.join(out, filename);
        try {
          const current = mediaKey(await readFile(destination));
          if (previousCache[filename] === current) {
            nextCache[filename] = current;
            return;
          }
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        const temporary = `${destination}.tmp`;
        await sharp(bytes)
          .rotate()
          .resize({ width, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toFile(temporary);
        nextCache[filename] = mediaKey(await readFile(temporary));
        await rename(temporary, destination);
      })(),
    );
  return conversions.get(filename);
}
const used = new Set();
const prepared = [];
let cursor = 0;
async function worker() {
  while (cursor < catalog.photos.length) {
    const index = cursor++;
    const photo = catalog.photos[index];
    let bytes;
    if (config) {
      if (!/^[0-9a-f-]{36}$/i.test(photo.file || ""))
        throw new Error(`Missing or invalid image file: ${photo.slug}`);
      const response = await cmsRequest(config, `/assets/${photo.file}`);
      // Refuse unexpectedly large source images before buffering them.
      if (Number(response.headers.get("content-length")) > 80 * 1024 * 1024)
        throw new Error("Image exceeds 80 MiB");
      const chunks = [];
      let total = 0;
      for await (const chunk of response.body) {
        total += chunk.length;
        if (total > 80 * 1024 * 1024) throw new Error("Image exceeds 80 MiB");
        chunks.push(chunk);
      }
      bytes = Buffer.concat(chunks);
    } else {
      const imageRoot = await realpath(path.join(root, "src/images"));
      const file = await realpath(path.resolve(imageRoot, photo.file));
      if (!file.startsWith(imageRoot + path.sep))
        throw new Error("Photo file must be inside src/images");
      bytes = await readFile(file);
    }
    const metadata = await sharp(bytes, {
      limitInputPixels: 100000000,
    }).metadata();
    if (!["jpeg", "png", "webp", "avif"].includes(metadata.format))
      throw new Error(`Unsupported image: ${photo.slug}`);
    const dimensions = metadata.autoOrient || metadata;
    const key = mediaKey(bytes);
    const widths = [
      ...new Set([640, 1280, 2400].map((w) => Math.min(w, dimensions.width))),
    ];
    for (const width of widths) {
      const filename = `${key}-${width}.webp`;
      used.add(filename);
      await prepareVariant(filename, bytes, width);
    }
    const variants = widths.map((width) => ({
      width,
      src: `/media/${key}-${width}.webp`,
    }));
    const medium = variants.find((v) => v.width >= 1280) || variants.at(-1);
    prepared[index] = {
      slug: photo.slug,
      title: photo.title,
      alt: photo.alt,
      album: photo.album,
      description: photo.description || "",
      location: photo.location || "",
      taken_at: photo.taken_at || "",
      width: dimensions.width,
      height: dimensions.height,
      src: medium.src,
      large: variants.at(-1).src,
      srcset: variants.map((v) => `${v.src} ${v.width}w`).join(", "),
    };
  }
}
await Promise.all(
  Array.from({ length: Math.min(3, catalog.photos.length) }, worker),
);
await writeFile(
  ".portfolio/catalog.json.tmp",
  JSON.stringify({
    albums: catalog.albums.map((a) => ({
      slug: a.slug,
      title: a.title,
      description: a.description || "",
    })),
    photos: prepared,
  }),
);
await rename(".portfolio/catalog.json.tmp", ".portfolio/catalog.json");
await writeFile(".portfolio/media-cache.json.tmp", JSON.stringify(nextCache));
await rename(".portfolio/media-cache.json.tmp", ".portfolio/media-cache.json");
for (const file of await readdir(out)) {
  if (/^[a-f0-9]{24}-\d+\.webp$/.test(file) && !used.has(file))
    await unlink(path.join(out, file));
}
console.log(
  `Prepared ${prepared.length} photos in ${catalog.albums.length} albums (${mode}); EXIF stripped, display size <=2400px.`,
);
