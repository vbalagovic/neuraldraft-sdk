// Live smoke test for the SDK against http://localhost/v1 (or whatever
// NEURALDRAFT_API_URL points at). Run with:
//
//   NEURALDRAFT_API_KEY=ndsk_test_xxx npx tsx scripts/smoke.ts
//
// Mirrors the equivalent script in mcp/scripts/smoke.ts so regressions can be
// spotted side-by-side.

import { NeuralDraftClient } from "../src/index.js";

const apiKey = process.env.NEURALDRAFT_API_KEY;
if (!apiKey) {
  console.error("Set NEURALDRAFT_API_KEY env var");
  process.exit(1);
}

const client = new NeuralDraftClient({
  apiKey,
  apiUrl: process.env.NEURALDRAFT_API_URL ?? "http://localhost/v1",
  userAgent: "neuraldraft-sdk-smoke/0.1.0",
});

const results: { name: string; ok: boolean; summary: string }[] = [];

async function run(name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    const r = await fn();
    results.push({
      name,
      ok: true,
      summary: typeof r === "object" ? JSON.stringify(r).slice(0, 140) : String(r),
    });
  } catch (err) {
    results.push({
      name,
      ok: false,
      summary: err instanceof Error ? err.message.slice(0, 240) : String(err),
    });
  }
}

await run("projects.me", () => client.projects.me());
await run("brand.get", () => client.brand.get());
await run("products.list", () => client.products.list({ page_size: 5 }));
await run("blogPosts.list", () => client.blogPosts.list({ page_size: 5 }));
await run("components.list", () => client.components.list({ page_size: 5 }));
await run("booking.listServices", () => client.booking.listServices({ page_size: 5 }));
await run("components.register", () =>
  client.components.register({
    html: '<section><h1 data-translate="hero.headline">Hello</h1></section>',
    intent: "marketing_hero",
    page_slug: "home",
  }),
);
await run("content.bulkCreate", () =>
  client.content.bulkCreate({ "hero.cta": "Get started" }, "en"),
);

console.log("");
for (const r of results) {
  console.log(`${r.ok ? "OK" : "FAIL"} ${r.name.padEnd(28)} ${r.summary}`);
}
process.exit(results.every((r) => r.ok) ? 0 : 1);
