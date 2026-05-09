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
  RegisteredComponent,
  TranslationKeyCreateResult,
} from "./types.js";

const SDK_VERSION = "0.1.0";
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
 * `images`, `products`, `booking`, `components`, `jobs`, `projects`) so the
 * surface mirrors the API tags. All methods are async and may throw
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
   * created (no separate "create" endpoint exists).
   *
   * Pass `create_if_missing: false` to require the key already exist (the API
   * will return 404 otherwise).
   */
  async set(
    key: string,
    value: string,
    language: string,
    opts: { create_if_missing?: boolean } = {},
  ): Promise<void> {
    const create_if_missing = opts.create_if_missing !== false;
    await this.t.request<unknown>("PUT", `/content/${encodeURIComponent(key)}`, {
      value,
      // Both `language_code` (legacy) and `lang` (current spec) are accepted;
      // we send both to maximise compatibility with deployed API versions.
      language_code: language,
      lang: language,
      create_if_missing,
    });
  }

  /**
   * Bulk-create translation keys with default values.
   *
   * The v1 API has no single bulk endpoint, so this iterates `PUT /content/{key}`.
   * 409 (key exists) is treated as "skipped" rather than failing the batch.
   */
  async bulkCreate(
    keys: Record<string, string>,
    language: string = "en",
  ): Promise<TranslationKeyCreateResult> {
    const created: string[] = [];
    const skipped_existing: string[] = [];
    for (const [key, value] of Object.entries(keys)) {
      try {
        await this.t.request<unknown>(
          "PUT",
          `/content/${encodeURIComponent(key)}`,
          { value, language_code: language, lang: language, create_if_missing: true },
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
}

// -------------------- Resource: Components --------------------

class ComponentsResource {
  constructor(private readonly t: Transport) {}

  /**
   * POST /components/register — register a chunk of HTML as an editable
   * component. `data-translate` attributes are extracted into content keys;
   * `data-image-key` attributes register image slots.
   */
  register(input: {
    html: string;
    intent: string;
    page_slug?: string;
  }): Promise<RegisteredComponent> {
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
  get(id: string): Promise<RegisteredComponent> {
    return this.t.request<RegisteredComponent>(
      "GET",
      `/components/${encodeURIComponent(id)}`,
    );
  }
}

// -------------------- Resource: Blog posts --------------------

class BlogPostsResource {
  constructor(private readonly t: Transport) {}

  /** POST /blog-posts — create a manual draft (synchronous, 0 credits). */
  create(input: BlogPostCreateInput): Promise<BlogPost> {
    return this.t.request<BlogPost>("POST", "/blog-posts", input);
  }

  /**
   * POST /blog-posts with `{ ai: ... }` — kick off the AI generation
   * pipeline. Returns a {@link JobReference}; poll it via `client.jobs.poll`.
   *
   * `translate_to` is a SDK convenience — it is forwarded to the API as
   * `ai.translate_to_languages` to match the request schema.
   */
  generateAi(input: BlogAiInput): Promise<JobReference> {
    const { translate_to, ...rest } = input;
    return this.t.request<JobReference>("POST", "/blog-posts", {
      ai: {
        ...rest,
        ...(translate_to && translate_to.length > 0
          ? { translate_to_languages: translate_to }
          : {}),
      },
    });
  }

  /** GET /blog-posts — paginated list (filter by status, language, etc.). */
  list(
    params: {
      page?: number;
      page_size?: number;
      status?: BlogPostStatus;
      lang?: string;
      category_id?: number;
      search?: string;
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
   * a page to homepage demotes any previously-homepage page. Free; does not
   * consume credits.
   */
  create(input: PageCreateInput): Promise<Page> {
    return this.t.request<Page>("POST", "/pages", input);
  }

  /**
   * PATCH /pages/{id} — merge-semantics update. Only fields you pass are
   * overwritten — meta keys you omit are preserved. Pass an explicit `null`
   * to clear a meta field.
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
   * `{ url, key, width, height }`. Costs ~40 credits per image.
   */
  generate(input: ImageGenerateInput): Promise<JobReference> {
    return this.t.request<JobReference>("POST", "/images", input);
  }

  /**
   * PUT /images/{key} — replace by direct URL or regenerate via AI.
   *
   * - `{ url }`: synchronous swap, returns the updated {@link Image} (200).
   * - `{ regenerate: true, prompt, ... }`: returns a {@link JobReference} (202).
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
   * POST /images (multipart) — direct file upload. Synchronous, 0 credits.
   * `key` is required and must match `^[\w.\-\/]+$`. Returns the registered
   * {@link Image}.
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
   * bytes. Synchronous, 0 credits. Returns the registered {@link Image}.
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

  /** GET /products/{id}. */
  get(id: string | number): Promise<Product> {
    return this.t.request<Product>("GET", `/products/${encodeURIComponent(String(id))}`);
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

  /**
   * Resolve the embed snippet for a bookable service.
   *
   * Validates the service exists (so a clean 404 surfaces here rather than
   * silently returning a broken script tag) and synthesises an HTML snippet
   * pointing at `/widgets/booking/{id}.js`.
   */
  async getWidget(serviceId: string | number): Promise<BookingWidgetEmbed> {
    await this.t.request<unknown>(
      "GET",
      `/bookable-services/${encodeURIComponent(String(serviceId))}`,
    );
    const snippet_url = `${this.t.apiUrl}/widgets/booking/${encodeURIComponent(
      String(serviceId),
    )}.js`;
    const embed_html = `<script src="${snippet_url}" async data-neuraldraft-booking="${serviceId}"></script>`;
    return { embed_html, snippet_url, service_id: serviceId };
  }
}

// -------------------- Resource: Jobs --------------------

class JobsResource {
  constructor(private readonly t: Transport) {}

  /** GET /jobs/{id} — single status read. */
  get(id: string): Promise<JobReference> {
    return this.t.request<JobReference>("GET", `/jobs/${encodeURIComponent(id)}`);
  }

  /**
   * Poll `GET /jobs/{id}` until status is one of `completed | failed | cancelled`,
   * or `timeoutMs` elapses (in which case throws a timeout `ApiError`).
   *
   * @param opts.intervalMs Default 1500ms between polls.
   * @param opts.timeoutMs  Default 5 minutes.
   */
  async poll(
    id: string,
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
