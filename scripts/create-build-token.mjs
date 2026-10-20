import { randomBytes } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { admin, config } from "./directus-admin.mjs";

// Exclusive file creation prevents overwriting an existing token/configuration.
const output = await open(".env.build", "wx", 0o600);
let policy;
let user;
try {
  policy = await admin("/policies", "POST", {
    name: `Portfolio build ${new Date().toISOString()}`,
    icon: "web",
    admin_access: false,
    app_access: false,
  });
  for (const collection of ["albums", "photos", "directus_files"]) {
    await admin("/permissions", "POST", {
      policy: policy.id,
      collection,
      action: "read",
      fields: ["*"],
      permissions:
        collection === "directus_files" ? {} : { status: { _eq: "published" } },
    });
  }
  const token = randomBytes(32).toString("hex");
  user = await admin("/users", "POST", {
    first_name: "Portfolio build",
    status: "active",
    token,
  });
  await admin("/access", "POST", { user: user.id, policy: policy.id });
  await output.writeFile(
    `PORTFOLIO_SOURCE=directus\nDIRECTUS_URL=${config.url}\nDIRECTUS_TOKEN=${token}\n`,
  );
  console.log(
    "Saved a read-only build token in .env.build (mode 0600). No anonymous access or write permissions were enabled. Keep this file private.",
  );
} catch (error) {
  if (user) await admin(`/users/${user.id}`, "DELETE").catch(() => {});
  if (policy) await admin(`/policies/${policy.id}`, "DELETE").catch(() => {});
  await unlink(".env.build");
  throw error;
} finally {
  await output.close();
}
