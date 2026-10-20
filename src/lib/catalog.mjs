import { createHash } from "node:crypto";

export function slug(value, label = "slug") {
  if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(
      `${label} must contain lowercase letters, numbers and single hyphens`,
    );
  }
  return value;
}

export function validateCatalog(input) {
  if (!Array.isArray(input.albums) || !Array.isArray(input.photos))
    throw new Error("Catalog needs albums and photos arrays");
  const albums = new Set();
  for (const album of input.albums) {
    slug(album.slug, "Album slug");
    if (albums.has(album.slug))
      throw new Error(`Duplicate album slug: ${album.slug}`);
    albums.add(album.slug);
    if (!album.title?.trim()) throw new Error("Album title is required");
  }
  const photos = new Set();
  for (const photo of input.photos) {
    slug(photo.slug, "Photo slug");
    if (photos.has(photo.slug))
      throw new Error(`Duplicate photo slug: ${photo.slug}`);
    photos.add(photo.slug);
    if (!albums.has(photo.album))
      throw new Error(`Unknown album: ${photo.album}`);
    if (!photo.title?.trim() || !photo.alt?.trim())
      throw new Error(`Photo ${photo.slug} needs title and alt`);
    if (
      photo.taken_at &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(photo.taken_at) ||
        new Date(photo.taken_at).toISOString().slice(0, 10) !== photo.taken_at)
    )
      throw new Error(`Invalid date: ${photo.taken_at}`);
  }
  return input;
}

export function mediaKey(bytes) {
  return createHash("sha256")
    .update(bytes)
    .update("portfolio-webp-v1-quality82")
    .digest("hex")
    .slice(0, 24);
}

export function cmsConfig(env) {
  if (!env.DIRECTUS_URL)
    throw new Error("DIRECTUS_URL is required for Directus mode");
  const url = new URL(env.DIRECTUS_URL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("Invalid DIRECTUS_URL");
  if (
    url.protocol !== "https:" &&
    !["127.0.0.1", "localhost", "directus"].includes(url.hostname)
  )
    throw new Error("Use HTTPS for remote Directus connections");
  return { url: url.href.replace(/\/$/, ""), token: env.DIRECTUS_TOKEN || "" };
}

export async function cmsRequest(config, path, options = {}) {
  const response = await fetch(`${config.url}${path}`, {
    ...options,
    headers: {
      ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  if (!response.ok)
    throw new Error(
      `Directus request failed (${response.status}) at ${path.split("?")[0]}`,
    );
  return response;
}

export async function cmsItems(config, collection, fields) {
  const result = [];
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({
      fields,
      limit: "100",
      page: String(page),
      sort: "sort,id",
      "filter[status][_eq]": "published",
    });
    const response = await cmsRequest(config, `/items/${collection}?${query}`);
    const { data } = await response.json();
    if (!Array.isArray(data))
      throw new Error(`Invalid Directus response: ${collection}`);
    result.push(...data);
    if (data.length < 100) return result;
  }
}

export async function loadDirectus(config) {
  const albums = await cmsItems(
    config,
    "albums",
    "id,slug,title,description,sort",
  );
  const photos = await cmsItems(
    config,
    "photos",
    "id,slug,title,alt,description,location,taken_at,sort,album,file",
  );
  const byId = new Map(albums.map((a) => [a.id, a.slug]));
  return validateCatalog({
    albums,
    // A photo belonging to an unpublished album is deliberately unpublished as well.
    photos: photos
      .filter((p) => byId.has(p.album))
      .map((p) => ({ ...p, album: byId.get(p.album) })),
  });
}
