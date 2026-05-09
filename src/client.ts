import { ApiError } from "./errors.js";
import type {
  BlogAiInput,
  BlogPost,
  BlogPostCreateInput,
  BlogPostStatus,
  BlogPostUpdateInput,
  BookableService,
  BookingWidgetEmbed,
  BrandContext,
  ComponentRegisterInput,
  ComponentUpdateInput,
  ContentScope,
  ContentValue,
  Image,
  ImageGenerateInput,
  ImageListParams,
  ImageReplaceInput,
  ImageUploadFile,
  ImageUploadOptions,
  JobReference,
  Page,
  PageCreateInput,
  PageListParams,
  PageUpdateInput,
  Paginated,
  Product,
  ProductCreateInput,
  Project,
  ProjectUpdateInput,
  ProjectUsage,
  RegisteredComponent,
  TenantsForEmailResponse,
  TranslationKeyCreateResult,
} from "./types.js";

const SDK_VERSION = "0.3.0";
const DEFAULT_API_URL = "https://api.neuraldraft.io/v1";

/**
 * Configuration for {@link NeuralDraftClient}.
 *
 * `apiKey` is the only required field. Everything else has a sensible default.
 */
export interface NeuralDraftClientOptions {
  /** Project API key. Format: `ndsk_live_…` (production) or `ndsk_test_…` (test mode). */
  apiKey: string;
  /** Override the API base URL. Defaults to `https://api.neuraldraft.io/v1`. */
  apiUrl?: string;
  /** Override the User-Agent header. Defaults to `neuraldraft-sdk/<version>`. */
  userAgent?: string;
  /** Inject a custom `fetch` implementation (useful for tests or proxying). */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds. Default: no timeout (caller-imposed). */
  timeout?: number;
}

interface ResolvedConfig {
  apiKey: string;
  apiUrl: string;
  userAgent: string;
  fetchImpl: typeof fetch;
  timeout: number | undefined;
}

/**
 * Official TypeScript client for the Neural Draft Project API.
 *
 * Methods are grouped into resource namespaces (`brand`, `content`, `blogPosts`,
 * `images`, `products`, `booking`, `components`, `pages`, `jobs`, `projects`)
 * so the surface mirrors the API tags. All methods are async and may throw
 * {@link ApiError} on non-2xx responses or transport failures.
 *
 * @example Basic usage
 *   const client = new NeuralDraftClient({ apiKey: process.env.NEURALDRAFT_API_KEY! });
 *   const brand = await client.brand.get();
 *   const job = await client.blogPosts.generateAi({ topic: "morning yoga" });
 *   const finished = await client.jobs.poll(job.id);
 */
export class NeuralDraftClient {
  private readonly cfg: ResolvedConfig;

  // -------------------- Resource namespaces --------------------

  /** Brand context — voice, audience, colors, fonts, goals. */
  readonly brand: BrandResource;
  /** Content / translation keys. */
  readonly content: ContentResource;
  /** Editable HTML components registered into the admin. */
  readonly components: ComponentsResource;
  /** Blog posts — CRUD plus AI generation. */
  readonly blogPosts: BlogPostsResource;
  /** Multi-page authoring with per-page SEO meta. */
  readonly pages: PagesResource;
  /** Brand-consistent image generation. */
  readonly images: ImagesResource;
  /** Products / e-commerce. */
  readonly products: ProductsResource;
  /** Bookings (services + embeddable widget snippets). */
  readonly booking: BookingResource;
  /** Async jobs (poll status, wait for completion). */
  readonly jobs: JobsResource;
  /** The current project (the one this API key belongs to). */
  readonly projects: ProjectsResource;

  constructor(options: NeuralDraftClientOptions) {
    if (!options || !options.apiKey) {
      throw new Error("NeuralDraftClient: `apiKey` is required.");
    }
    this.cfg = {
      apiKey: options.apiKey,
      apiUrl: stripTrailingSlash(options.apiUrl ?? DEFAULT_API_URL),
      userAgent: options.userAgent ?? `neuraldraft-sdk/${SDK_VERSION}`,
      fetchImpl: options.fetch ?? globalThis.fetch.bind(globalThis),
      timeout: options.timeout,
    };

    const transport: Transport = {
      request: this.request.bind(this),
      apiUrl: this.cfg.apiUrl,
    };

    this.brand = new BrandResource(transport);
    this.content = new ContentResource(transport);
    this.components = new ComponentsResource(transport);
    this.blogPosts = new BlogPostsResource(transport);
    this.pages = new PagesResource(transport);
    this.images = new ImagesResource(transport);
    this.products = new ProductsResource(transport);
    this.booking = new BookingResource(transport);
    this.jobs = new JobsResource(transport);
    this.projects = new ProjectsResource(transport);
  }

  // -------------------- Static helpers (no API key) --------------------

  /**
   * Look up the workspaces a given email is registered against on the central
   * login host. Used by the central-login workspace picker when an address
   * matches more than one project.
   *
   * Unlike every other SDK method, this hits the *central* host (e.g.
   * `https://app.neuraldraft.io`), not the per-project API host, and does
   * NOT require an API key. The endpoint always returns 200 with a (possibly
   * empty) `tenants` array — this is intentional, to defeat email enumeration.
   *
   * @param email Address to look up.
   * @param opts.centralUrl Override the central host. Defaults to
   *   `https://app.neuraldraft.io`.
   * @param opts.fetch Inject a custom fetch (useful for tests).
   */
  static async tenantsForEmail(
    email: string,
    opts: { centralUrl?: string; fetch?: typeof fetch } = {},
  ): Promise<TenantsForEmailResponse> {
    const base = stripTrailingSlash(opts.centralUrl ?? "https://app.neuraldraft.io");
    const fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const url = `${base}/central/api/tenants-for-email?email=${encodeURIComponent(email)}`;

    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": `neuraldraft-sdk/${SDK_VERSION}`,
        },
      });
    } catch (err) {
      throw new ApiError(0, err instanceof Error ? err.message : String(err), "/central/api/tenants-for-email");
    }

    if (!res.ok) {
      const text = await safeText(res);
      throw new ApiError(res.status, text || res.statusText, "/central/api/tenants-for-email");
    }

    const json = (await res.json()) as TenantsForEmailResponse;
    return { tenants: json.tenants ?? [] };
  }

  // -------------------- Internals --------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    const url = `${this.cfg.apiUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.cfg.apiKey}`,
      Accept: "application/json",
      "User-Agent": this.cfg.userAgent,
      ...extraHeaders,
    };
    let payload: string | FormData | undefined;
    if (body !== undefined) {
      if (isFormData(body)) {
        // Let fetch set the Content-Type with the multipart boundary.
        payload = body;
      } else {
        payload = JSON.stringify(body);
        headers["Content-Type"] = "application/json";
      }
    }

    // Set up an AbortController if a timeout is configured.
    let abortSignal: AbortSignal | undefined;
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    if (this.cfg.timeout !== undefined && this.cfg.timeout > 0) {
      const controller = new AbortController();
      abortSignal = controller.signal;
      timeoutHandle = setTimeout(() => controller.abort(), this.cfg.timeout);
    }

    let res: Response;
    try {
      res = await this.cfg.fetchImpl(url, {
        method,
        headers,
        body: payload,
        signal: abortSignal,
      });
    } catch (err) {
      throw new ApiError(0, err instanceof Error ? err.message : String(err), path);
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }

    if (!res.ok) {
      const text = await safeText(res);
      throw new ApiError(res.status, text || res.statusText, path);
    }

    if (res.status === 204) return undefined as T;

    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = (await res.json()) as unknown;
      // Laravel V1 JsonResource responses are wrapped in {data: ...} — unwrap.
      // Image controller is the one outlier wrapping in {job: ...}.
      // Anything without those wrappers (paginated lists with their own
      // data+meta, bulk content reads, RFC 7807 errors, etc.) is returned
      // as-is.
      return unwrapResource(json) as T;
    }
    return (await res.text()) as unknown as T;
  }
}

// -------------------- Transport (private — passed to resources) --------------------

interface Transport {
  request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T>;
  apiUrl: string;
}

// -------------------- Resource: Brand --------------------

class BrandResource {
  constructor(private readonly t: Transport) {}

  /** GET /brand — read the brand context. */
  get(): Promise<BrandContext> {
    return this.t.request<BrandContext>("GET", "/brand");
  }

  /** PATCH /brand — partial update. Send `null` to clear a field. */
  update(patch: Partial<BrandContext>): Promise<BrandContext> {
    return this.t.request<BrandContext>("PATCH", "/brand", patch);
  }
}

// -------------------- Resource: Content --------------------

class ContentResource {
  constructor(private readonly t: Transport) {}

  /**
   * GET /content/{key} — read a single content value in one language.
   * The response includes `all_locales` with every translation present.
   */
  get(key: string, opts: { lang?: string } = {}): Promise<ContentValue> {
    const qs = toQuery({ lang: opts.lang });
    return this.t.request<ContentValue>(
      "GET",
      `/content/${encodeURIComponent(key)}${qs}`,
    );
  }

  /**
   * PUT /content/{key} — upsert a value. If the key does not exist it is
   * created automatically.
   *
   * Charges 1 credit per call (`content_update`).
   *
   * The API accepts exactly `{value, lang?, scope?}`. Unknown fields are
   * silently dropped by the validator — pass only those documented here.
   */
  async set(
    key: string,
    value: string,
    language: string,
    opts: { scope?: ContentScope } = {},
  ): Promise<ContentValue> {
    return this.t.request<ContentValue>(
      "PUT",
      `/content/${encodeURIComponent(key)}`,
      {
        value,
        lang: language,
        ...(opts.scope ? { scope: opts.scope } : {}),
      },
    );
  }

  /**
   * Bulk-create translation keys with default values.
   *
   * The v1 API has no single bulk endpoint, so this iterates `PUT /content/{key}`.
   * 409 (key exists) is treated as "skipped" rather than failing the batch.
   *
   * Charges 1 credit per successfully written key.
   */
  async bulkCreate(
    keys: Record<string, string>,
    language: string = "en",
    opts: { scope?: ContentScope } = {},
  ): Promise<TranslationKeyCreateResult> {
    const created: string[] = [];
    const skipped_existing: string[] = [];
    for (const [key, value] of Object.entries(keys)) {
      try {
        await this.t.request<unknown>(
          "PUT",
          `/content/${encodeURIComponent(key)}`,
          {
            value,
            lang: language,
            ...(opts.scope ? { scope: opts.scope } : {}),
          },
        );
        created.push(key);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          skipped_existing.push(key);
          continue;
        }
        throw err;
      }
    }
    return { created, skipped_existing };
  }

  /**
   * POST /content/{key}/translate — async translation of one key into
   * one or more target locales. Returns a {@link JobReference}; poll via
   * `client.jobs.poll(job.id)`.
   *
   * Charges 7 credits per target language (`translate_language`).
   */
  translate(
    key: string,
    targetLanguages: string[],
    opts: { source_lang?: string } = {},
  ): Promise<JobReference> {
    return this.t.request<JobReference>(
      "POST",
      `/content/${encodeURIComponent(key)}/translate`,
      {
        target_langs: targetLanguages,
        ...(opts.source_lang ? { source_lang: opts.source_lang } : {}),
      },
    );
  }

  /** DELETE /content/{key} — remove the key and every translation. 204 on success. */
  delete(key: string): Promise<void> {
    return this.t.request<void>(
      "DELETE",
      `/content/${encodeURIComponent(key)}`,
    );
  }
}

// -------------------- Resource: Components --------------------

class ComponentsResource {
  constructor(private readonly t: Transport) {}

  /**
   * POST /components/register — register a chunk of HTML as an editable
   * component. `data-translate` attributes are extracted into content keys;
   * `data-image-key` attributes register image slots.
   */
  register(input: ComponentRegisterInput): Promise<RegisteredComponent> {
    return this.t.request<RegisteredComponent>("POST", "/components/register", input);
  }

  /** GET /components — paginated list. */
  list(
    params: { page?: number; page_size?: number; page_slug?: string; intent?: string } = {},
  ): Promise<Paginated<RegisteredComponent>> {
    return this.t.request<Paginated<RegisteredComponent>>(
      "GET",
      `/components${toQuery(params)}`,
    );
  }

  /** GET /components/{id} — read a single component. */
  get(id: string | number): Promise<RegisteredComponent> {
    return this.t.request<RegisteredComponent>(
      "GET",
      `/components/${encodeURIComponent(String(id))}`,
    );
  }

  /**
   * PUT /components/{id} — replace a component's HTML. Re-parses the body,
   * creating any new translation keys; existing-but-unreferenced keys are
   * left in place (orphaned, not deleted).
   */
  update(id: string | number, input: ComponentUpdateInput): Promise<RegisteredComponent> {
    return this.t.request<RegisteredComponent>(
      "PUT",
      `/components/${encodeURIComponent(String(id))}`,
      input,
    );
  }

  /** DELETE /components/{id} — hard delete. 204 on success. */
  delete(id: string | number): Promise<void> {
    return this.t.request<void>(
      "DELETE",
      `/components/${encodeURIComponent(String(id))}`,
    );
  }
}

// -------------------- Resource: Blog posts --------------------

class BlogPostsResource {
  constructor(private readonly t: Transport) {}

  /**
   * POST /blog-posts (`type: "manual"`) — create a manual draft.
   * Synchronous, 0 credits (subject to per-plan post-limit quotas).
   */
  create(input: BlogPostCreateInput): Promise<BlogPost> {
    return this.t.request<BlogPost>("POST", "/blog-posts", {
      type: "manual",
      ...input,
    });
  }

  /**
   * POST /blog-posts (`type: "ai"`) — kick off the AI generation pipeline.
   * Returns a {@link JobReference}; poll it via `client.jobs.poll`.
   *
   * Charges 60 credits (`blog_post`).
   */
  generateAi(input: BlogAiInput): Promise<JobReference> {
    return this.t.request<JobReference>("POST", "/blog-posts", {
      type: "ai",
      ...input,
    });
  }

  /** GET /blog-posts — paginated list (filter by status, language, etc.). */
  list(
    params: {
      page?: number;
      page_size?: number;
      status?: BlogPostStatus;
      lang?: string;
      category?: string;
      tag?: string;
      sort?: "created_at" | "published_at" | "-created_at" | "-published_at";
    } = {},
  ): Promise<Paginated<BlogPost>> {
    return this.t.request<Paginated<BlogPost>>("GET", `/blog-posts${toQuery(params)}`);
  }

  /**
   * GET /blog-posts/{id_or_slug} — fetch a single post. Numeric ids and slugs
   * are both accepted.
   */
  get(idOrSlug: string | number, opts: { lang?: string } = {}): Promise<BlogPost> {
    const qs = toQuery({ lang: opts.lang });
    return this.t.request<BlogPost>(
      "GET",
      `/blog-posts/${encodeURIComponent(String(idOrSlug))}${qs}`,
    );
  }

  /**
   * PATCH /blog-posts/{id} — update fields on an existing post. Text fields
   * (title, content, excerpt, meta_title, meta_description) write to the
   * matching translation row resolved by `language_code` (default 'en').
   * Post-level fields (slug, status, category_id, featured_image, tags)
   * write to the post itself.
   */
  update(id: number, input: BlogPostUpdateInput): Promise<BlogPost> {
    return this.t.request<BlogPost>(
      "PATCH",
      `/blog-posts/${encodeURIComponent(String(id))}`,
      input,
    );
  }

  /**
   * POST /blog-posts/{id}/translate — async translate to N target languages.
   * Returns a {@link JobReference}.
   *
   * Charges 7 credits per target language (`translate_language`).
   */
  translate(id: number, targetLanguages: string[]): Promise<JobReference> {
    return this.t.request<JobReference>(
      "POST",
      `/blog-posts/${encodeURIComponent(String(id))}/translate`,
      { target_languages: targetLanguages },
    );
  }

  /** POST /blog-posts/{id}/publish — flip status to `published`. */
  publish(id: number): Promise<{ id: number; status: string; published_at: string | null }> {
    return this.t.request("POST", `/blog-posts/${encodeURIComponent(String(id))}/publish`);
  }

  /** POST /blog-posts/{id}/unpublish — revert status to `draft`. */
  unpublish(id: number): Promise<{ id: number; status: string }> {
    return this.t.request("POST", `/blog-posts/${encodeURIComponent(String(id))}/unpublish`);
  }

  /** POST /blog-posts/{id}/schedule — schedule for future publication. */
  schedule(id: number, scheduledAt: string | Date): Promise<{ id: number; status: string; scheduled_at: string | null }> {
    const iso = scheduledAt instanceof Date ? scheduledAt.toISOString() : scheduledAt;
    return this.t.request(
      "POST",
      `/blog-posts/${encodeURIComponent(String(id))}/schedule`,
      { scheduled_at: iso },
    );
  }

  /** DELETE /blog-posts/{id} — hard delete. 204 on success. */
  delete(id: number): Promise<void> {
    return this.t.request<void>(
      "DELETE",
      `/blog-posts/${encodeURIComponent(String(id))}`,
    );
  }
}

// -------------------- Resource: Pages --------------------

class PagesResource {
  constructor(private readonly t: Transport) {}

  /**
   * GET /pages — paginated list of `TenantPage` rows. Filter by `type`
   * (landing / blog_list / blog_post / legal) or `is_active`. Pages are
   * ordered with the homepage first, then alphabetically by slug.
   */
  list(params: PageListParams = {}): Promise<Paginated<Page>> {
    return this.t.request<Paginated<Page>>(
      "GET",
      `/pages${toQuery(params as Record<string, unknown>)}`,
    );
  }

  /** GET /pages/{idOrSlug} — fetch one page by numeric id or slug. */
  get(idOrSlug: string | number): Promise<Page> {
    return this.t.request<Page>(
      "GET",
      `/pages/${encodeURIComponent(String(idOrSlug))}`,
    );
  }

  /**
   * POST /pages — create a `TenantPage` with optional SEO meta. Promoting
   * a page to homepage demotes any previously-homepage page.
   *
   * Charges 1 credit (`page_update`).
   */
  create(input: PageCreateInput): Promise<Page> {
    return this.t.request<Page>("POST", "/pages", input);
  }

  /**
   * PATCH /pages/{id} — merge-semantics update. Only fields you pass are
   * overwritten — meta keys you omit are preserved. Pass an explicit `null`
   * to clear a meta field.
   *
   * Charges 1 credit (`page_update`).
   */
  update(id: number, input: PageUpdateInput): Promise<Page> {
    return this.t.request<Page>(
      "PATCH",
      `/pages/${encodeURIComponent(String(id))}`,
      input,
    );
  }

  /**
   * DELETE /pages/{id} — soft-retire (default: sets `is_active=false`) or
   * hard-delete with `force=true`. Refuses to delete the homepage.
   */
  delete(id: number, opts: { force?: boolean } = {}): Promise<void> {
    const qs = opts.force ? "?force=1" : "";
    return this.t.request<void>(
      "DELETE",
      `/pages/${encodeURIComponent(String(id))}${qs}`,
    );
  }
}

// -------------------- Resource: Images --------------------

class ImagesResource {
  constructor(private readonly t: Transport) {}

  /**
   * GET /images — paginated list of registered image keys. Optional `prefix`
   * narrows by user-key prefix (e.g. `hero.` returns `hero.background`,
   * `hero.foreground`, …).
   */
  list(params: ImageListParams = {}): Promise<Paginated<Image>> {
    return this.t.request<Paginated<Image>>(
      "GET",
      `/images${toQuery(params as Record<string, unknown>)}`,
    );
  }

  /** GET /images/{key} — resolve a registered image. 404 if not registered. */
  get(key: string): Promise<Image> {
    return this.t.request<Image>("GET", `/images/${encodeURIComponent(key)}`);
  }

  /**
   * POST /images — kick off async AI generation. Returns a
   * {@link JobReference}; on completion the `result` contains
   * `{ url, key, width, height }`.
   *
   * Charges 32 credits per image (`image`).
   */
  generate(input: ImageGenerateInput): Promise<JobReference> {
    return this.t.request<JobReference>("POST", "/images", input);
  }

  /**
   * PUT /images/{key} — replace by direct URL or regenerate via AI.
   *
   * - `{ url }`: synchronous swap, returns the updated {@link Image} (200).
   *   Charges 1 credit (`image_register`).
   * - `{ regenerate: true, prompt, ... }`: kicks off async AI regeneration,
   *   returns a {@link JobReference} (202). Charges 32 credits (`image`).
   *
   * The two shapes are discriminated by the `regenerate` field, so TypeScript
   * narrows the return type accordingly.
   */
  replace(key: string, input: { url: string }): Promise<Image>;
  replace(
    key: string,
    input: {
      regenerate: true;
      prompt: string;
      aspect_ratio?: ImageGenerateInput["aspect_ratio"];
      style?: string;
    },
  ): Promise<JobReference>;
  replace(key: string, input: ImageReplaceInput): Promise<Image | JobReference> {
    return this.t.request<Image | JobReference>(
      "PUT",
      `/images/${encodeURIComponent(key)}`,
      input,
    );
  }

  /**
   * POST /images (multipart) — direct file upload. Synchronous.
   * `key` is required and must match `^[\w.\-\/]+$`. Returns the registered
   * {@link Image}.
   *
   * Charges 1 credit (`image_register`).
   *
   * Pass either a `File`/`Blob` (browser, Bun, Node 20+) or a raw
   * `Buffer`/`Uint8Array`. For raw buffers, supply `opts.filename` so the
   * server can derive the extension.
   */
  async upload(
    key: string,
    file: ImageUploadFile,
    opts: ImageUploadOptions = {},
  ): Promise<Image> {
    const form = buildUploadFormData(key, file, opts);
    return this.t.request<Image>("POST", "/images", form);
  }

  /**
   * PUT /images/{key} (multipart) — replace the image at `key` with uploaded
   * bytes. Synchronous. Returns the registered {@link Image}.
   *
   * Charges 1 credit (`image_register`).
   */
  async replaceFile(
    key: string,
    file: ImageUploadFile,
    opts: ImageUploadOptions = {},
  ): Promise<Image> {
    // Build without `key` since the path already encodes it.
    const form = buildUploadFormData(null, file, opts);
    return this.t.request<Image>(
      "PUT",
      `/images/${encodeURIComponent(key)}`,
      form,
    );
  }

  /** DELETE /images/{key} — remove the registration. 204 on success. */
  delete(key: string): Promise<void> {
    return this.t.request<void>("DELETE", `/images/${encodeURIComponent(key)}`);
  }
}

// -------------------- Resource: Products --------------------

class ProductsResource {
  constructor(private readonly t: Transport) {}

  /** GET /products — paginated list. */
  list(
    params: {
      page?: number;
      page_size?: number;
      status?: "draft" | "active" | "archived";
      type?: "physical" | "digital" | "service";
      category_id?: number;
      featured?: boolean;
      search?: string;
    } = {},
  ): Promise<Paginated<Product>> {
    return this.t.request<Paginated<Product>>("GET", `/products${toQuery(params)}`);
  }

  /** GET /products/{id_or_slug}. */
  get(idOrSlug: string | number): Promise<Product> {
    return this.t.request<Product>(
      "GET",
      `/products/${encodeURIComponent(String(idOrSlug))}`,
    );
  }

  /** POST /products. */
  create(input: ProductCreateInput): Promise<Product> {
    return this.t.request<Product>("POST", "/products", input);
  }

  /** PATCH /products/{id} — partial update. */
  update(id: string | number, patch: Partial<ProductCreateInput>): Promise<Product> {
    return this.t.request<Product>(
      "PATCH",
      `/products/${encodeURIComponent(String(id))}`,
      patch,
    );
  }

  /** DELETE /products/{id} — soft-delete. 204 on success. */
  delete(id: string | number): Promise<void> {
    return this.t.request<void>(
      "DELETE",
      `/products/${encodeURIComponent(String(id))}`,
    );
  }
}

// -------------------- Resource: Booking --------------------

class BookingResource {
  constructor(private readonly t: Transport) {}

  /** GET /bookable-services — paginated list of bookable services. */
  listServices(
    params: {
      page?: number;
      page_size?: number;
      status?: "active" | "inactive";
      search?: string;
    } = {},
  ): Promise<Paginated<BookableService>> {
    return this.t.request<Paginated<BookableService>>(
      "GET",
      `/bookable-services${toQuery(params)}`,
    );
  }

  /** GET /bookable-services/{id}. */
  getService(id: string | number): Promise<BookableService> {
    return this.t.request<BookableService>(
      "GET",
      `/bookable-services/${encodeURIComponent(String(id))}`,
    );
  }

  /**
   * Resolve the embed snippet for a bookable service.
   *
   * Validates the service exists (so a clean 404 surfaces here rather than
   * silently returning a broken script tag), then synthesises an HTML
   * snippet. The widget script lives at
   * `/v1/widgets/booking/{tenant_id}/{service_id}.js` — both ids are
   * required, so caller must supply the tenant id (read it from
   * `client.projects.me()`).
   */
  async getWidget(
    tenantId: string | number,
    serviceId: string | number,
  ): Promise<BookingWidgetEmbed> {
    await this.t.request<unknown>(
      "GET",
      `/bookable-services/${encodeURIComponent(String(serviceId))}`,
    );
    const snippet_url = `${this.t.apiUrl}/widgets/booking/${encodeURIComponent(
      String(tenantId),
    )}/${encodeURIComponent(String(serviceId))}.js`;
    const embed_html = `<script src="${snippet_url}" async data-neuraldraft-booking="${serviceId}"></script>`;
    return { embed_html, snippet_url, service_id: serviceId };
  }
}

// -------------------- Resource: Jobs --------------------

class JobsResource {
  constructor(private readonly t: Transport) {}

  /** GET /jobs/{id} — single status read. */
  get(id: string | number): Promise<JobReference> {
    return this.t.request<JobReference>("GET", `/jobs/${encodeURIComponent(String(id))}`);
  }

  /** POST /jobs/{id}/cancel — cancel an in-flight job. Returns the updated job. */
  cancel(id: string | number): Promise<JobReference> {
    return this.t.request<JobReference>("POST", `/jobs/${encodeURIComponent(String(id))}/cancel`);
  }

  /**
   * Poll `GET /jobs/{id}` until status is one of `completed | failed | cancelled`,
   * or `timeoutMs` elapses (in which case throws a timeout `ApiError`).
   *
   * @param opts.intervalMs Default 1500ms between polls.
   * @param opts.timeoutMs  Default 5 minutes.
   */
  async poll(
    id: string | number,
    opts: { intervalMs?: number; timeoutMs?: number } = {},
  ): Promise<JobReference> {
    const intervalMs = opts.intervalMs ?? 1500;
    const timeoutMs = opts.timeoutMs ?? 5 * 60_000;
    const deadline = Date.now() + timeoutMs;

    // First fetch happens immediately; subsequent ones wait `intervalMs`.
    let job = await this.get(id);
    while (!isTerminal(job)) {
      if (Date.now() >= deadline) {
        throw new ApiError(
          0,
          `Job ${id} did not reach a terminal state within ${timeoutMs}ms (last status=${job.status}).`,
          `/jobs/${id}`,
        );
      }
      await sleep(intervalMs);
      job = await this.get(id);
    }
    return job;
  }
}

// -------------------- Resource: Projects --------------------

class ProjectsResource {
  constructor(private readonly t: Transport) {}

  /**
   * GET /projects/me — the project this API key belongs to. Use it to
   * bootstrap context (target languages, plan, etc.) at app start-up.
   */
  me(): Promise<Project> {
    return this.t.request<Project>("GET", "/projects/me");
  }

  /** PATCH /projects/me — update editable project fields. */
  update(input: ProjectUpdateInput): Promise<Project> {
    return this.t.request<Project>("PATCH", "/projects/me", input);
  }

  /** GET /projects/me/usage — credit balance + per-operation breakdown for the current period. */
  usage(): Promise<ProjectUsage> {
    return this.t.request<ProjectUsage>("GET", "/projects/me/usage");
  }
}

// -------------------- Helpers --------------------

/**
 * Unwrap a Laravel JsonResource-style response.
 *
 * - `{data: X, meta: ...}`  → return as-is (paginated list)
 * - `{data: X}` (single)    → return X
 * - `{job: X}`              → return X (image controller)
 * - anything else           → return as-is
 *
 * Exported for testing only — do not depend on this from application code.
 */
export function unwrapResource(value: unknown): unknown {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const obj = value as Record<string, unknown>;
  if ("data" in obj && "meta" in obj) return obj;
  if ("data" in obj && Object.keys(obj).length === 1) return obj.data;
  if ("job" in obj && Object.keys(obj).length === 1) return obj.job;
  return obj;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function toQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.set(k, String(v));
  return `?${sp.toString()}`;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

function isTerminal(job: JobReference): boolean {
  return job.status === "completed" || job.status === "failed" || job.status === "cancelled";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Detect a `FormData` body so the transport can skip the JSON Content-Type
 * header (the runtime sets a multipart boundary for us). Works in browsers,
 * Bun, and Node 20+ where `FormData` is a global.
 */
function isFormData(body: unknown): body is FormData {
  return (
    typeof FormData !== "undefined" &&
    body instanceof FormData
  );
}

/**
 * Build a multipart `FormData` payload for image uploads.
 *
 * `key` is appended only when the API path lacks it (POST /images creates a
 * new registration; PUT /images/{key} already encodes it in the URL).
 *
 * Caller may pass a `File`/`Blob` (preferred) or a raw `Uint8Array`/`Buffer`.
 * For raw buffers, `opts.filename` is required so the server can derive the
 * file extension; otherwise we fall back to `upload.bin`.
 */
function buildUploadFormData(
  key: string | null,
  file: ImageUploadFile,
  opts: ImageUploadOptions,
): FormData {
  if (typeof FormData === "undefined" || typeof Blob === "undefined") {
    throw new Error(
      "FormData / Blob are not available in this runtime. Use Node 20+, Bun, or a browser.",
    );
  }
  const form = new FormData();
  if (key !== null) form.append("key", key);

  let blob: Blob;
  let filename = opts.filename;

  if (file instanceof Blob) {
    // File extends Blob — pick up the name automatically.
    blob = file;
    filename = filename ?? (file as File).name ?? "upload.bin";
  } else if (file instanceof ArrayBuffer || ArrayBuffer.isView(file)) {
    blob = new Blob([file as ArrayBuffer | Uint8Array], {
      type: opts.contentType ?? "application/octet-stream",
    });
    filename = filename ?? "upload.bin";
  } else {
    throw new Error(
      "images.upload(): `file` must be a File, Blob, ArrayBuffer, or Uint8Array.",
    );
  }

  form.append("file", blob, filename);
  return form;
}
