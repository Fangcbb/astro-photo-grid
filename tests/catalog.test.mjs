import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import {
  cmsConfig,
  cmsItems,
  cmsRequest,
  loadDirectus,
  validateCatalog,
} from "../src/lib/catalog.mjs";

const valid = () => ({
  albums: [{ slug: "travel", title: "旅途" }],
  photos: [
    {
      slug: "morning",
      album: "travel",
      title: "晨光",
      alt: "晨雾中的山峰",
      taken_at: "2024-02-29",
    },
  ],
});

test("valid catalog and empty portfolio", () => {
  assert.equal(validateCatalog(valid()).photos.length, 1);
  assert.deepEqual(validateCatalog({ albums: [], photos: [] }).photos, []);
});
for (const [name, mutate] of [
  ["duplicate photo URLs", (c) => c.photos.push({ ...c.photos[0] })],
  ["duplicate album URLs", (c) => c.albums.push({ ...c.albums[0] })],
  [
    "unknown albums",
    (c) => {
      c.photos[0].album = "absent";
    },
  ],
  [
    "path traversal slugs",
    (c) => {
      c.photos[0].slug = "../private";
    },
  ],
  [
    "missing accessible descriptions",
    (c) => {
      c.photos[0].alt = "";
    },
  ],
  [
    "impossible dates",
    (c) => {
      c.photos[0].taken_at = "2025-02-29";
    },
  ],
])
  test(`reject ${name}`, () => {
    const c = valid();
    mutate(c);
    assert.throws(() => validateCatalog(c));
  });

test("CMS configuration requires a safe URL", () => {
  for (const url of [
    "http://remote.example",
    "https://user:secret@example.com",
    "file:///tmp",
    "https://example.com/?token=x",
  ])
    assert.throws(() => cmsConfig({ DIRECTUS_URL: url }));
  assert.equal(
    cmsConfig({ DIRECTUS_URL: "https://cms.example.com/" }).url,
    "https://cms.example.com",
  );
  assert.equal(cmsConfig({ DIRECTUS_URL: "http://127.0.0.1:8055" }).token, "");
});

async function mock(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    token: "test-private-token",
  };
}
test("CMS paginates and sends authentication only in headers", async (t) => {
  const pages = [];
  const config = await mock(t, (req, res) => {
    assert.equal(req.headers.authorization, "Bearer test-private-token");
    assert.ok(!req.url.includes("test-private-token"));
    const params = new URL(req.url, "http://localhost").searchParams;
    assert.equal(params.get("filter[status][_eq]"), "published");
    const page = Number(params.get("page"));
    pages.push(page);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        data: Array.from({ length: page === 1 ? 100 : 1 }, (_, i) => ({
          id: (page - 1) * 100 + i,
        })),
      }),
    );
  });
  assert.equal((await cmsItems(config, "photos", "id")).length, 101);
  assert.deepEqual(pages, [1, 2]);
});
test("unpublished albums cannot leak photos into static output", async (t) => {
  const config = await mock(t, (req, res) => {
    const data = req.url.startsWith("/items/albums")
      ? [{ id: "public", slug: "travel", title: "旅途" }]
      : [
          {
            id: 1,
            album: "public",
            slug: "morning",
            title: "晨光",
            alt: "晨雾",
          },
          {
            id: 2,
            album: "private",
            slug: "hidden",
            title: "隐藏",
            alt: "隐藏",
          },
        ];
    res.end(JSON.stringify({ data }));
  });
  const result = await loadDirectus(config);
  assert.deepEqual(
    result.photos.map((p) => p.slug),
    ["morning"],
  );
});
test("authentication errors fail without leaking credentials", async (t) => {
  const config = await mock(t, (_req, res) => {
    res.writeHead(403);
    res.end("sensitive error body");
  });
  await assert.rejects(
    cmsRequest(config, "/items/photos"),
    (error) =>
      error.message.includes("403") &&
      !error.message.includes(config.token) &&
      !error.message.includes("sensitive"),
  );
});
