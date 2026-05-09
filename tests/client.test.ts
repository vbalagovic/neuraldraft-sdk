import { describe, it, expect, beforeEach, afterEach } from "vitest";
import nock from "nock";
import { ApiError, NeuralDraftClient } from "../src/index.js";

const TEST_API_BASE = "http://api.test.local/v1";
const TEST_API_KEY = "ndsk_test_aaaaaaaaaaaaaaaaaaaaaaaa";

function makeClient(overrides: Partial<ConstructorParameters<typeof NeuralDraftClient>[0]> = {}) {
  return new NeuralDraftClient({
    apiKey: TEST_API_KEY,
    apiUrl: TEST_API_BASE,
    userAgent: "neuraldraft-sdk-test/0.0.0",
    ...overrides,
  });
}

describe("NeuralDraftClient", () => {
  beforeEach(() => {
    nock.disableNetConnect();
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  // -------------------- Construction --------------------

  describe("construction", () => {
    it("requires an apiKey", () => {
      // @ts-expect-error — testing runtime behaviour
      expect(() => new NeuralDraftClient({})).toThrow(/apiKey/);
    });

    it("defaults apiUrl to production", () => {
      const c = new NeuralDraftClient({ apiKey: TEST_API_KEY });
      // The default URL is captured internally; we can only verify by call,
      // but at least confirm construction doesn't blow up.
      expect(c).toBeInstanceOf(NeuralDraftClient);
    });

    it("strips trailing slash from apiUrl", async () => {
      nock(TEST_API_BASE).get("/brand").reply(200, { voice: "warm" });
      const c = makeClient({ apiUrl: `${TEST_API_BASE}/` });
      const brand = await c.brand.get();
      expect(brand.voice).toBe("warm");
    });
  });

  // -------------------- Brand --------------------

  describe("brand", () => {
    it("brand.get unwraps a {data: ...} JsonResource envelope", async () => {
      nock(TEST_API_BASE)
        .get("/brand")
        .matchHeader("authorization", `Bearer ${TEST_API_KEY}`)
        .matchHeader("user-agent", /neuraldraft-sdk/)
        .reply(200, {
          data: {
            voice: "warm and grounded",
            audience: "yoga-curious adults",
            colors: { primary: { hex: "#3F6B5C", name: "deep sage" } },
          },
        });

      const c = makeClient();
      const brand = await c.brand.get();
      expect(brand.voice).toBe("warm and grounded");
      expect(brand.colors?.primary?.hex).toBe("#3F6B5C");
    });

    it("brand.get returns raw object when no envelope is present", async () => {
      nock(TEST_API_BASE)
        .get("/brand")
        .reply(200, { voice: "warm", audience: "adults" });
      const c = makeClient();
      const brand = await c.brand.get();
      expect(brand.voice).toBe("warm");
      expect(brand.audience).toBe("adults");
    });

    it("brand.update sends PATCH with the patch body", async () => {
      nock(TEST_API_BASE)
        .patch("/brand", (body: Record<string, unknown>) => {
          const colors = body.colors as { primary?: { hex?: string } } | undefined;
          return colors?.primary?.hex === "#2A4A3C";
        })
        .matchHeader("content-type", /application\/json/)
        .reply(200, {
          voice: "warm",
          colors: { primary: { hex: "#2A4A3C", name: "forest" } },
        });

      const c = makeClient();
      const updated = await c.brand.update({
        colors: { primary: { hex: "#2A4A3C", name: "forest" } },
      });
      expect(updated.colors?.primary?.name).toBe("forest");
    });
  });

  // -------------------- Content --------------------

  describe("content", () => {
    it("content.get fetches a single value with optional lang", async () => {
      nock(TEST_API_BASE)
        .get("/content/hero.headline")
        .query({ lang: "fr" })
        .reply(200, {
          key: "hero.headline",
          value: "Trouvez votre calme",
          lang: "fr",
          all_locales: { en: "Find your calm", fr: "Trouvez votre calme" },
        });
      const c = makeClient();
      const v = await c.content.get("hero.headline", { lang: "fr" });
      expect(v.value).toBe("Trouvez votre calme");
      expect(v.lang).toBe("fr");
    });

    it("content.get URL-encodes dotted keys safely", async () => {
      nock(TEST_API_BASE)
        .get(/\/content\/footer/)
        .reply(200, { key: "footer.copy", value: "© 2026", lang: "en" });
      const c = makeClient();
      const v = await c.content.get("footer.copy");
      expect(v.value).toBe("© 2026");
    });

    it("content.set PUTs exactly {value, lang} (validator's accepted shape)", async () => {
      nock(TEST_API_BASE)
        .put("/content/hero.headline", (body: Record<string, unknown>) =>
          body.value === "Welcome" &&
          body.lang === "en" &&
          !("language_code" in body) &&
          !("create_if_missing" in body),
        )
        .reply(200, { key: "hero.headline", value: "Welcome", lang: "en" });

      const c = makeClient();
      await c.content.set("hero.headline", "Welcome", "en");
    });

    it("content.set forwards scope when provided", async () => {
      nock(TEST_API_BASE)
        .put("/content/hero.headline", (body: Record<string, unknown>) =>
          body.scope === "page",
        )
        .reply(200, { key: "hero.headline", value: "Welcome", lang: "en" });

      const c = makeClient();
      await c.content.set("hero.headline", "Welcome", "en", { scope: "page" });
    });

    it("content.bulkCreate treats 409 as skipped_existing without failing the batch", async () => {
      nock(TEST_API_BASE)
        .put("/content/nav.home")
        .reply(409, JSON.stringify({ code: "key_exists" }));
      nock(TEST_API_BASE)
        .put("/content/nav.about")
        .reply(200, { key: "nav.about", value: "About", lang: "en" });

      const c = makeClient();
      const r = await c.content.bulkCreate({ "nav.home": "Home", "nav.about": "About" });
      expect(r.created).toEqual(["nav.about"]);
      expect(r.skipped_existing).toEqual(["nav.home"]);
    });

    it("content.bulkCreate rethrows non-409 errors", async () => {
      nock(TEST_API_BASE).put("/content/nav.home").reply(500, "boom");
      const c = makeClient();
      await expect(c.content.bulkCreate({ "nav.home": "Home" })).rejects.toBeInstanceOf(ApiError);
    });
  });

  // -------------------- Components --------------------

  describe("components", () => {
    it("components.register POSTs html + intent and returns the component", async () => {
      nock(TEST_API_BASE)
        .post("/components/register", (body: Record<string, unknown>) =>
          body.intent === "marketing_hero" &&
          typeof body.html === "string" &&
          (body.html as string).includes("data-translate"),
        )
        .reply(201, {
          id: "cmp_2Ngd9KqLmRpW",
          intent: "marketing_hero",
          page_slug: "home",
          html: "<section>...</section>",
          keys_created: ["hero.headline", "hero.cta"],
          editor_url: "https://app.neuraldraft.io/c/cmp_2Ngd9KqLmRpW",
          created_at: "2026-04-19T10:14:02Z",
          updated_at: "2026-04-19T10:14:02Z",
        });
      const c = makeClient();
      const cmp = await c.components.register({
        html: '<section><h1 data-translate="hero.headline">Hi</h1></section>',
        intent: "marketing_hero",
        page_slug: "home",
      });
      expect(cmp.id).toBe("cmp_2Ngd9KqLmRpW");
      expect(cmp.keys_created).toContain("hero.headline");
    });

    it("components.list returns Paginated<RegisteredComponent>", async () => {
      nock(TEST_API_BASE)
        .get("/components")
        .query({ page: "1", page_size: "20" })
        .reply(200, {
          data: [
            { id: "cmp_a", html: "<a/>", created_at: "x", updated_at: "x" },
            { id: "cmp_b", html: "<b/>", created_at: "x", updated_at: "x" },
          ],
          meta: { page: 1, page_size: 20, total: 2 },
        });
      const c = makeClient();
      const list = await c.components.list({ page: 1, page_size: 20 });
      expect(list.data).toHaveLength(2);
      expect(list.meta.total).toBe(2);
    });

    it("components.get fetches a single component", async () => {
      nock(TEST_API_BASE)
        .get("/components/cmp_x")
        .reply(200, {
          id: "cmp_x",
          html: "<section/>",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        });
      const c = makeClient();
      const cmp = await c.components.get("cmp_x");
      expect(cmp.id).toBe("cmp_x");
    });
  });

  // -------------------- Blog posts --------------------

  describe("blogPosts", () => {
    it("blogPosts.create posts a manual draft with type=manual", async () => {
      nock(TEST_API_BASE)
        .post("/blog-posts", (body: Record<string, unknown>) =>
          body.type === "manual" &&
          body.title === "Hello" &&
          body.language_code === "en",
        )
        .reply(201, {
          id: 142,
          slug: "hello",
          status: "draft",
          title: "Hello",
        });
      const c = makeClient();
      const post = await c.blogPosts.create({
        title: "Hello",
        content: "<p>Hi</p>",
        language_code: "en",
      });
      expect(post.id).toBe(142);
    });

    it("blogPosts.generateAi sends type=ai with fields at the top level", async () => {
      nock(TEST_API_BASE)
        .post("/blog-posts", (body: Record<string, unknown>) =>
          body.type === "ai" &&
          body.topic === "morning routines" &&
          body.translate_to_all === true,
        )
        .reply(202, {
          id: "job_de",
          type: "blog_post.generate",
          status: "pending",
          created_at: "2026-04-19T10:00:00Z",
        });
      const c = makeClient();
      const job = await c.blogPosts.generateAi({
        topic: "morning routines",
        translate_to_all: true,
      });
      expect(job.id).toBe("job_de");
      expect(job.status).toBe("pending");
    });

    it("blogPosts.translate POSTs target_languages array", async () => {
      nock(TEST_API_BASE)
        .post("/blog-posts/42/translate", (body: Record<string, unknown>) =>
          Array.isArray(body.target_languages) &&
          (body.target_languages as string[]).includes("de"),
        )
        .reply(202, {
          id: "job_t",
          type: "translation",
          status: "pending",
          created_at: "2026-04-19T10:00:00Z",
        });
      const c = makeClient();
      const job = await c.blogPosts.translate(42, ["de", "fr"]);
      expect(job.id).toBe("job_t");
    });

    it("blogPosts.list returns paginated results", async () => {
      nock(TEST_API_BASE)
        .get("/blog-posts")
        .query({ status: "published", page: "1" })
        .reply(200, {
          data: [{ id: 1, slug: "a", status: "published", title: "A" }],
          meta: { page: 1, page_size: 20, total: 1 },
        });
      const c = makeClient();
      const list = await c.blogPosts.list({ status: "published", page: 1 });
      expect(list.data[0]?.title).toBe("A");
    });

    it("blogPosts.get accepts both numeric ids and slugs", async () => {
      nock(TEST_API_BASE)
        .get("/blog-posts/my-slug")
        .query({ lang: "en" })
        .reply(200, {
          id: 5,
          slug: "my-slug",
          status: "published",
          title: "My slug",
        });
      const c = makeClient();
      const post = await c.blogPosts.get("my-slug", { lang: "en" });
      expect(post.id).toBe(5);
    });
  });

  // -------------------- Images --------------------

  describe("images", () => {
    it("images.generate POSTs and unwraps the {job: ...} envelope", async () => {
      nock(TEST_API_BASE)
        .post("/images", (body: Record<string, unknown>) =>
          body.prompt === "sage studio" && body.aspect_ratio === "16:9",
        )
        .reply(202, {
          // Image controller wraps in {job: ...}; SDK should unwrap.
          job: {
            id: "job_img_1",
            type: "image.generate",
            status: "pending",
            created_at: "2026-04-19T10:00:00Z",
          },
        });
      const c = makeClient();
      const job = await c.images.generate({
        prompt: "sage studio",
        aspect_ratio: "16:9",
      });
      expect(job.id).toBe("job_img_1");
      expect(job.type).toBe("image.generate");
    });

    it("images.generate also handles unwrapped responses", async () => {
      nock(TEST_API_BASE)
        .post("/images")
        .reply(202, {
          id: "job_img_2",
          type: "image.generate",
          status: "pending",
          created_at: "2026-04-19T10:00:00Z",
        });
      const c = makeClient();
      const job = await c.images.generate({ prompt: "x" });
      expect(job.id).toBe("job_img_2");
    });
  });

  // -------------------- Products --------------------

  describe("products", () => {
    it("products.list paginates", async () => {
      nock(TEST_API_BASE)
        .get("/products")
        .query({ page: "1", page_size: "5" })
        .reply(200, {
          data: [
            { id: 1, name: "Mat", slug: "mat", price: 4900, currency: "gbp", status: "active" },
            { id: 2, name: "Block", slug: "block", price: 1500, currency: "gbp", status: "active" },
          ],
          meta: { page: 1, page_size: 5, total: 2 },
        });
      const c = makeClient();
      const list = await c.products.list({ page: 1, page_size: 5 });
      expect(list.data).toHaveLength(2);
      expect(list.data[0]?.name).toBe("Mat");
    });

    it("products.get fetches by id", async () => {
      nock(TEST_API_BASE)
        .get("/products/42")
        .reply(200, {
          id: 42,
          name: "Premium",
          slug: "premium",
          price: 8900,
          currency: "gbp",
          status: "active",
        });
      const c = makeClient();
      const p = await c.products.get(42);
      expect(p.name).toBe("Premium");
    });

    it("products.create POSTs a new product", async () => {
      nock(TEST_API_BASE)
        .post("/products", (body: Record<string, unknown>) =>
          body.name === "Cork block" && body.price === 2999,
        )
        .reply(201, {
          id: 100,
          name: "Cork block",
          slug: "cork-block",
          price: 2999,
          currency: "gbp",
          status: "active",
        });
      const c = makeClient();
      const p = await c.products.create({
        name: "Cork block",
        price: 2999,
        currency: "gbp",
        status: "active",
      });
      expect(p.id).toBe(100);
    });

    it("products.update PATCHes only the supplied fields", async () => {
      nock(TEST_API_BASE)
        .patch("/products/100", (body: Record<string, unknown>) => body.price === 2799)
        .reply(200, {
          id: 100,
          name: "Cork block",
          slug: "cork-block",
          price: 2799,
          currency: "gbp",
          status: "active",
        });
      const c = makeClient();
      const p = await c.products.update(100, { price: 2799 });
      expect(p.price).toBe(2799);
    });
  });

  // -------------------- Booking --------------------

  describe("booking", () => {
    it("booking.listServices returns paginated services", async () => {
      nock(TEST_API_BASE)
        .get("/bookable-services")
        .query({ status: "active" })
        .reply(200, {
          data: [
            {
              id: 12,
              name: "Private yoga",
              slug: "private-yoga",
              price: 7500,
              currency: "gbp",
              status: "active",
            },
          ],
          meta: { page: 1, page_size: 20, total: 1 },
        });
      const c = makeClient();
      const list = await c.booking.listServices({ status: "active" });
      expect(list.data[0]?.name).toBe("Private yoga");
    });

    it("booking.getWidget validates the service then synthesises the embed", async () => {
      nock(TEST_API_BASE)
        .get("/bookable-services/12")
        .reply(200, {
          id: 12,
          name: "Private yoga",
          slug: "private-yoga",
          price: 7500,
          currency: "gbp",
          status: "active",
        });
      const c = makeClient();
      const w = await c.booking.getWidget(7, 12);
      expect(w.snippet_url).toBe(`${TEST_API_BASE}/widgets/booking/7/12.js`);
      expect(w.embed_html).toContain('data-neuraldraft-booking="12"');
      expect(w.service_id).toBe(12);
    });

    it("booking.getWidget surfaces a 404 from the validation read", async () => {
      nock(TEST_API_BASE).get("/bookable-services/9999").reply(404, "not found");
      const c = makeClient();
      await expect(c.booking.getWidget(7, 9999)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  // -------------------- Jobs --------------------

  describe("jobs", () => {
    it("jobs.get fetches a single job", async () => {
      nock(TEST_API_BASE)
        .get("/jobs/job_abc")
        .reply(200, {
          id: "job_abc",
          type: "blog_post.generate",
          status: "processing",
          progress: 50,
          created_at: "2026-04-19T10:00:00Z",
        });
      const c = makeClient();
      const j = await c.jobs.get("job_abc");
      expect(j.status).toBe("processing");
      expect(j.progress).toBe(50);
    });

    it("jobs.poll resolves when status reaches completed", async () => {
      nock(TEST_API_BASE)
        .get("/jobs/job_p")
        .reply(200, {
          id: "job_p",
          type: "blog_post.generate",
          status: "processing",
          progress: 50,
          created_at: "x",
        });
      nock(TEST_API_BASE)
        .get("/jobs/job_p")
        .reply(200, {
          id: "job_p",
          type: "blog_post.generate",
          status: "completed",
          progress: 100,
          result: { post_id: 142, slug: "x", title: "y" },
          created_at: "x",
        });

      const c = makeClient();
      const j = await c.jobs.poll("job_p", { intervalMs: 5, timeoutMs: 5_000 });
      expect(j.status).toBe("completed");
      expect((j.result as { post_id?: number } | null | undefined)?.post_id).toBe(142);
    });

    it("jobs.poll throws on timeout when never reaching terminal state", async () => {
      // Reply with `processing` indefinitely — 4 mocked responses is plenty
      // because each poll cycle waits intervalMs, and the timeout will hit
      // before that many cycles complete.
      nock(TEST_API_BASE)
        .persist()
        .get("/jobs/job_slow")
        .reply(200, {
          id: "job_slow",
          type: "translation.batch",
          status: "processing",
          created_at: "x",
        });

      const c = makeClient();
      await expect(
        c.jobs.poll("job_slow", { intervalMs: 5, timeoutMs: 30 }),
      ).rejects.toMatchObject({ status: 0 });
    });

    it("jobs.poll resolves on `failed` status (terminal but unsuccessful)", async () => {
      nock(TEST_API_BASE)
        .get("/jobs/job_f")
        .reply(200, {
          id: "job_f",
          type: "translation.batch",
          status: "failed",
          error: { code: "upstream_unavailable", message: "down" },
          created_at: "x",
        });
      const c = makeClient();
      const j = await c.jobs.poll("job_f", { intervalMs: 5, timeoutMs: 5_000 });
      expect(j.status).toBe("failed");
      expect(j.error?.code).toBe("upstream_unavailable");
    });
  });

  // -------------------- Projects --------------------

  describe("projects", () => {
    it("projects.me returns the current project", async () => {
      nock(TEST_API_BASE)
        .get("/projects/me")
        .reply(200, {
          data: {
            id: "prj_2NfQmBcKpXY8",
            name: "Lakeside Yoga",
            slug: "lakeside-yoga",
            default_language: "en",
            target_languages: ["en", "fr"],
            plan_type: "creator",
            credits_balance: 1500,
            commerce_enabled: true,
            booking_enabled: true,
            created_at: "2026-02-14T09:31:18Z",
            updated_at: "2026-02-14T09:31:18Z",
          },
        });
      const c = makeClient();
      const p = await c.projects.me();
      expect(p.id).toBe("prj_2NfQmBcKpXY8");
      expect(p.target_languages).toEqual(["en", "fr"]);
      expect(p.plan_type).toBe("creator");
    });

    it("projects.update PATCHes editable fields", async () => {
      nock(TEST_API_BASE)
        .patch("/projects/me", (body: Record<string, unknown>) =>
          body.project_name === "New Name",
        )
        .reply(200, {
          data: {
            id: 1,
            name: "New Name",
            slug: "new-name",
            default_language: "en",
            target_languages: ["en"],
            created_at: "2026-02-14T09:31:18Z",
            updated_at: "2026-02-14T09:31:18Z",
          },
        });
      const c = makeClient();
      const p = await c.projects.update({ project_name: "New Name" });
      expect(p.name).toBe("New Name");
    });
  });

  // -------------------- Static: tenants for email --------------------

  describe("static.tenantsForEmail", () => {
    it("hits the central host without an API key", async () => {
      nock("http://central.test.local")
        .get("/central/api/tenants-for-email")
        .query({ email: "user@example.com" })
        .reply(200, {
          tenants: [
            { id: 1, name: "Workspace A", domain: "a.example" },
            { id: 2, name: "Workspace B", domain: "b.example" },
          ],
        });

      const r = await NeuralDraftClient.tenantsForEmail("user@example.com", {
        centralUrl: "http://central.test.local",
      });
      expect(r.tenants).toHaveLength(2);
      expect(r.tenants[0]?.name).toBe("Workspace A");
    });

    it("returns an empty list for unknown emails (200)", async () => {
      nock("http://central.test.local")
        .get("/central/api/tenants-for-email")
        .query({ email: "unknown@example.com" })
        .reply(200, { tenants: [] });

      const r = await NeuralDraftClient.tenantsForEmail("unknown@example.com", {
        centralUrl: "http://central.test.local",
      });
      expect(r.tenants).toEqual([]);
    });
  });

  // -------------------- Errors --------------------

  describe("errors", () => {
    it("401 is surfaced as ApiError with status 401", async () => {
      nock(TEST_API_BASE).get("/brand").reply(401, "unauthorized");
      const c = makeClient();
      await expect(c.brand.get()).rejects.toMatchObject({
        name: "ApiError",
        status: 401,
        path: "/brand",
      });
    });

    it("402 (out of credits) is surfaced as ApiError with the body intact", async () => {
      nock(TEST_API_BASE)
        .post("/blog-posts")
        .reply(402, JSON.stringify({ code: "out_of_credits", detail: "0 credits" }));
      const c = makeClient();
      try {
        await c.blogPosts.generateAi({ topic: "x" });
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        const e = err as ApiError;
        expect(e.status).toBe(402);
        expect(e.body).toContain("out_of_credits");
      }
    });

    it("404 on unknown resource", async () => {
      nock(TEST_API_BASE).get("/products/999999").reply(404, "not found");
      const c = makeClient();
      await expect(c.products.get(999999)).rejects.toMatchObject({ status: 404 });
    });

    it("422 (validation) is surfaced with the API's body", async () => {
      nock(TEST_API_BASE)
        .post("/products")
        .reply(422, JSON.stringify({ code: "validation_failed", errors: { name: ["required"] } }));
      const c = makeClient();
      try {
        await c.products.create({ name: "", price: 1, currency: "gbp" });
        expect.fail("should have thrown");
      } catch (err) {
        const e = err as ApiError;
        expect(e.status).toBe(422);
        expect(e.body).toMatch(/validation_failed/);
      }
    });

    it("429 (rate limit) is surfaced", async () => {
      nock(TEST_API_BASE).get("/brand").reply(429, "Too Many Requests");
      const c = makeClient();
      await expect(c.brand.get()).rejects.toMatchObject({ status: 429 });
    });

    it("network errors are surfaced as ApiError(0, ...)", async () => {
      nock(TEST_API_BASE).get("/brand").replyWithError("ECONNREFUSED");
      const c = makeClient();
      try {
        await c.brand.get();
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect((err as ApiError).status).toBe(0);
      }
    });

    it("timeout aborts the request and throws an ApiError", async () => {
      nock(TEST_API_BASE)
        .get("/brand")
        .delay(200)
        .reply(200, { voice: "warm" });
      const c = makeClient({ timeout: 30 });
      await expect(c.brand.get()).rejects.toMatchObject({ status: 0 });
    });
  });

  // -------------------- Custom fetch injection --------------------

  describe("fetch injection", () => {
    it("uses a custom fetch when provided", async () => {
      let called = 0;
      const customFetch: typeof fetch = async (input, init) => {
        called++;
        // Return a minimal Response. Use globalThis.Response for portability.
        return new Response(JSON.stringify({ voice: "from-custom-fetch" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };
      const c = makeClient({ fetch: customFetch });
      const brand = await c.brand.get();
      expect(called).toBe(1);
      expect(brand.voice).toBe("from-custom-fetch");
    });
  });

  // -------------------- Headers --------------------

  describe("headers", () => {
    it("sends Accept: application/json on every request", async () => {
      nock(TEST_API_BASE)
        .get("/brand")
        .matchHeader("accept", /application\/json/)
        .reply(200, { voice: "x" });
      const c = makeClient();
      await c.brand.get();
    });

    it("custom userAgent is forwarded", async () => {
      nock(TEST_API_BASE)
        .get("/brand")
        .matchHeader("user-agent", "my-custom-agent/9.9")
        .reply(200, { voice: "x" });
      const c = makeClient({ userAgent: "my-custom-agent/9.9" });
      await c.brand.get();
    });
  });
});
