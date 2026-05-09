# @neuraldraft/sdk

> Official TypeScript SDK for the [Neural Draft](https://neuraldraft.io) Project API. Typed helpers for brand, content, blog, images, products, booking, and async jobs.

[![npm version](https://img.shields.io/npm/v/@neuraldraft/sdk.svg)](https://www.npmjs.com/package/@neuraldraft/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A small, zero-dependency, typed client over the Neural Draft v1 REST API. Wraps the same auth, pagination, error, and resource conventions documented in the [OpenAPI spec](https://docs.neuraldraft.io/openapi).

## Install

```bash
npm install @neuraldraft/sdk
```

Requires Node 20+ (uses the built-in `fetch`). Also works in any modern runtime that has `fetch` and `AbortController` in scope (Bun, Deno via `npm:` import, edge workers).

## Quickstart

Get a project API key from [the dashboard](https://neuraldraft.io/dashboard/api-keys). Use a test-mode key (`ndsk_test_…`) in development; live keys (`ndsk_live_…`) bill against your project's credits.

```ts
import { NeuralDraftClient } from "@neuraldraft/sdk";

const nd = new NeuralDraftClient({
  apiKey: process.env.NEURALDRAFT_API_KEY!,
});

const project = await nd.projects.me();
console.log(`Hello, ${project.name}.`);
```

By convention the API key lives in `NEURALDRAFT_API_KEY`. Never hard-code it; never commit it.

## Configuration

```ts
new NeuralDraftClient({
  apiKey: "ndsk_live_...",                    // required
  apiUrl: "https://api.neuraldraft.io/v1",    // optional, this is the default
  userAgent: "my-app/1.0.0",                  // optional, identifies your app in API logs
  timeout: 30_000,                            // optional, ms; defaults to no timeout
  fetch: customFetch,                         // optional, inject for testing or proxying
});
```

## API surface

The client groups methods into resource namespaces that match the API tags.

### `projects`

```ts
const project = await nd.projects.me(); // GET /projects/me
```

### `brand`

```ts
const brand = await nd.brand.get();                                    // GET  /brand
await nd.brand.update({ colors: { primary: { hex: "#2A4A3C" } } });    // PATCH /brand
```

### `content`

```ts
// Read a single key
const v = await nd.content.get("hero.headline", { lang: "fr" });
console.log(v.value, v.all_locales);

// Upsert a value (creates the key if it doesn't exist). Charges 1 credit.
await nd.content.set("hero.headline", "Welcome", "en");

// Bulk-create translation keys with default values. 409 (key exists) is
// treated as "skipped" rather than failing the batch.
const r = await nd.content.bulkCreate(
  { "hero.headline": "Find your calm", "hero.cta": "Get started" },
  "en",
);
console.log(r.created, r.skipped_existing);

// Async translate one key into many target locales. Charges 7 credits per
// language. Returns a JobReference — poll via nd.jobs.poll(job.id).
const job = await nd.content.translate("hero.headline", ["fr", "de"]);
```

### `components`

```ts
// Register editable HTML. data-translate="..." attributes become content keys;
// data-image-key="..." attributes become image slots.
const cmp = await nd.components.register({
  html: '<section><h1 data-translate="hero.headline">Hello</h1></section>',
  intent: "marketing_hero",
  page_slug: "home",
});
console.log(cmp.id, cmp.editor_url);

const list = await nd.components.list({ page_slug: "home", page_size: 50 });
const one = await nd.components.get("cmp_2Ngd9KqLmRpW");
```

### `blogPosts`

```ts
// Manual draft (synchronous, 0 credits — counts against your post quota)
const post = await nd.blogPosts.create({
  title: "5-minute breathwork",
  content: "<p>Hi.</p>",
  language_code: "en",
});

// AI generation (async — returns a Job; costs 60 credits)
const job = await nd.blogPosts.generateAi({
  topic: "5-minute breathwork for anxious mornings",
  word_count: 1200,
  primary_keyword: "morning breathwork",
  translate_to_all: true,
});
const finished = await nd.jobs.poll(job.id);
console.log("Generated:", finished.result);

// Translate an existing post to additional languages (7 credits per language)
const tjob = await nd.blogPosts.translate(post.id, ["de", "fr"]);

// Read & list
const posts = await nd.blogPosts.list({ status: "published", lang: "en" });
const one = await nd.blogPosts.get("5-minute-breathwork-for-anxious-mornings");
```

### `images`

```ts
// Async AI generation — costs 32 credits per image
const job = await nd.images.generate({
  prompt: "Serene yoga studio at dawn",
  aspect_ratio: "16:9",
  key: "hero.background",
});
const finished = await nd.jobs.poll(job.id);
const { url, key } = finished.result as { url: string; key: string };

// Synchronous URL swap — 1 credit
await nd.images.replace("hero.background", { url: "https://cdn.example/img.jpg" });

// Direct file upload (multipart) — 1 credit
await nd.images.upload("logo", fileOrBlob, { filename: "logo.svg" });
```

### `products`

```ts
const list = await nd.products.list({ status: "active" });
const p = await nd.products.get(42);

const created = await nd.products.create({
  name: "Cork yoga block (pair)",
  price: 2999,
  currency: "gbp",
  type: "physical",
  status: "active",
});

await nd.products.update(created.id, { price: 2799 });
```

### `booking`

```ts
const services = await nd.booking.listServices({ status: "active" });
const svc = await nd.booking.getService(12);

// Resolves an embeddable widget snippet for a service. Throws ApiError(404)
// if the service id is unknown. Both tenant id and service id are required —
// the widget script lives at /v1/widgets/booking/{tenant_id}/{service_id}.js.
const me = await nd.projects.me();
const widget = await nd.booking.getWidget(me.id, 12);
console.log(widget.embed_html); // <script src="..." async data-neuraldraft-booking="12"></script>
```

### `jobs`

```ts
// One-shot read
const job = await nd.jobs.get("job_2Ngd9KqLmRpW");

// Poll until terminal (completed | failed | cancelled). Throws on timeout.
const finished = await nd.jobs.poll(job.id, {
  intervalMs: 1500,
  timeoutMs: 5 * 60_000,
});
if (finished.status === "failed") {
  console.error(finished.error);
}

// Cancel an in-flight job
await nd.jobs.cancel(job.id);
```

### Central login: workspace picker

When an email is registered against more than one workspace, the central
login form needs to know which one to log into. `NeuralDraftClient.tenantsForEmail`
hits the central host (`https://app.neuraldraft.io`) without an API key and
returns the candidate workspaces:

```ts
const { tenants } = await NeuralDraftClient.tenantsForEmail("user@example.com");
for (const t of tenants) {
  console.log(t.id, t.name, t.domain);
}
```

## Error handling

Every method throws `ApiError` on non-2xx responses or transport failures.

```ts
import { ApiError } from "@neuraldraft/sdk";

try {
  await nd.blogPosts.generateAi({ topic: "..." });
} catch (err) {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      // Invalid API key — check your env config
    } else if (err.status === 402) {
      // Out of credits — direct user to top up at /billing
    } else if (err.status === 422) {
      // Validation: err.body is the API's RFC 7807 JSON; parse for `errors`
    } else if (err.status === 429) {
      // Rate-limited (60 req/min default) — back off and retry
    } else {
      throw err;
    }
  }
}
```

Branch on the API's stable machine code (in the JSON body's `code` field), not on the `title` string:

```ts
const body = JSON.parse(err.body) as { code?: string };
if (body.code === "out_of_credits") { /* … */ }
```

`status: 0` indicates a transport failure (DNS, connection refused, timeout). `path` carries the API path that produced the error, useful for logs.

## Pagination

List endpoints return `Paginated<T>`:

```ts
interface Paginated<T> {
  data: T[];
  meta: { page: number; page_size: number; total: number };
}
```

Iterate page by page yourself; the SDK is intentionally low-level.

## Async jobs

The API returns a `Job` reference for any operation that takes more than a couple of seconds (blog AI generation, image generation, batch translation). Jobs have a stable lifecycle:

```
pending → processing → completed | failed | cancelled
```

`client.jobs.poll(id)` calls `GET /jobs/{id}` repeatedly until the job reaches a terminal state. `failed` and `cancelled` resolve with the job (don't throw) — inspect `job.status` and `job.error` to decide what to do next.

## Versioning

This SDK targets the v1 stable surface of the Neural Draft API. Major version bumps mirror breaking API changes; minor versions add new methods or resources. Patch versions are bug fixes only.

## Local development

```bash
npm install
npm run lint    # tsc --noEmit
npm test
npm run build   # → dist/
```

To run against a local API:

```bash
NEURALDRAFT_API_KEY=ndsk_test_xxx \
NEURALDRAFT_API_URL=http://localhost/v1 \
npx tsx scripts/smoke.ts
```

## Links

- [Documentation](https://docs.neuraldraft.io)
- [OpenAPI spec](https://docs.neuraldraft.io/openapi)
- [MCP server (`@neuraldraft/mcp`)](https://www.npmjs.com/package/@neuraldraft/mcp) — for AI coding tools (Claude Code, Cursor, etc.)
- [Issues](https://github.com/vbalagovic/neuraldraft-sdk/issues)

## License

[MIT](./LICENSE).
