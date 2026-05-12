/**
 * TypeScript types for the Neural Draft Project API v1.
 *
 * These types are derived from the controller validation rules and
 * `App\Http\Resources\V1\*` transformers — i.e. they reflect the *actual*
 * runtime contract, not an idealised OpenAPI schema. Keep them in sync
 * with `app/Http/Controllers/Api/V1/*Controller.php` and
 * `app/Http/Resources/V1/*Resource.php`.
 *
 * Field optionality:
 *   - Anything the API may omit or send as `null` is `T | null` or `T?`.
 *   - Anything the controller treats as optional in writes is `T?`.
 */

// -------------------- Pagination --------------------

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  /** Present on most controllers — last page index. */
  last_page?: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

// -------------------- Project --------------------

/**
 * Plan identifier returned by the API on `Project.plan_type`. Free-form
 * (the API has more values internally), but these are the customer-facing
 * tiers we expose.
 */
export type ProjectPlan =
  | "free"
  | "starter"
  | "creator"
  | "build"
  | "scale"
  | "enterprise"
  | string;

export interface Project {
  id: string | number;
  name: string;
  slug: string | null;
  description?: string | null;
  domain?: string | null;
  custom_domain?: string | null;
  default_language: string;
  target_languages: string[];
  plan_type?: ProjectPlan;
  credits_balance?: number;
  commerce_enabled?: boolean;
  booking_enabled?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ProjectUpdateInput {
  name?: string;
  project_name?: string;
  project_slug?: string;
  project_description?: string | null;
  default_language?: string;
  target_languages?: string[];
  webhook_url?: string | null;
}

export interface ProjectUsageBreakdownEntry {
  operation_type: string;
  total_spent: number;
  count: number;
}

export interface ProjectUsage {
  credits_balance: number;
  credits_monthly_limit: number;
  credits_reset_at: string | null;
  period_start: string;
  period_end: string;
  total_spent_this_period: number;
  breakdown: ProjectUsageBreakdownEntry[];
}

// -------------------- Brand --------------------

export interface BrandColor {
  hex: string;
  name?: string | null;
}

/**
 * The PATCH /v1/brand validator does not constrain `content_tone` to a
 * fixed set — it is `string|max:100`. The values below are the supported
 * presets surfaced in the admin UI; the API will accept other strings too.
 */
export type BrandContentTone =
  | "friendly_professional"
  | "formal"
  | "playful"
  | "authoritative"
  | "warm"
  | "witty"
  | string;

export interface BrandFonts {
  heading?: string | null;
  body?: string | null;
}

export interface BrandColors {
  primary?: BrandColor | null;
  secondary?: BrandColor | null;
  accent?: BrandColor | null;
}

export interface BrandLanguage {
  code: string;
  name: string;
  is_default: boolean;
}

/**
 * Brand context returned by `GET /v1/brand`. Composed by `BrandController`
 * from three underlying tables (`TenantHomepage`, `DesignSystem`, `Tenant`).
 *
 * `requires_branding_badge` is true on free-tier projects — when set, the
 * project is required to render `branding_badge_html` in its footer.
 */
export interface BrandContext {
  voice?: string | null;
  audience?: string | null;
  content_tone?: BrandContentTone | null;
  content_goals?: string[];
  preferred_topics?: string[];
  description?: string | null;
  logo_url?: string | null;
  colors?: BrandColors;
  fonts?: BrandFonts;
  target_languages?: string[];
  default_language?: string;
  requires_branding_badge?: boolean;
  branding_badge_html?: string | null;
  /** Not currently emitted by the API; reserved for future expansion. */
  industry?: string | null;
  languages?: BrandLanguage[];
}

// -------------------- Content --------------------

export type ContentScope = "page" | "component" | "global";

export interface ContentValue {
  key: string;
  value: string | null;
  lang: string;
  all_locales?: Record<string, string>;
}

export interface TranslationKeyCreateResult {
  created: string[];
  skipped_existing: string[];
}

// -------------------- Components --------------------

export interface RegisteredComponent {
  id: string | number;
  intent?: string | null;
  page_slug?: string | null;
  html: string;
  keys_created?: string[];
  image_keys?: string[];
  editor_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ComponentRegisterInput {
  html: string;
  intent: string;
  page_slug?: string | null;
  /** Insertion order on the page (0 = first). */
  position?: number | null;
}

export interface ComponentUpdateInput {
  html: string;
  intent?: string | null;
  page_slug?: string | null;
}

// -------------------- Blog --------------------

export type BlogPostStatus = "draft" | "published" | "scheduled" | "archived";

export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Tag {
  id: number;
  name: string;
  slug: string;
}

export interface BlogPostTranslation {
  lang: string;
  title: string;
  excerpt?: string | null;
  content: string;
  meta_title?: string | null;
  meta_description?: string | null;
}

export interface BlogPost {
  id: number;
  slug: string;
  status: BlogPostStatus;
  featured_image?: string | null;
  published_at?: string | null;
  scheduled_at?: string | null;
  title: string;
  excerpt?: string | null;
  content?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  category?: Category | null;
  tags?: Tag[];
  translations?: BlogPostTranslation[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Manual blog-post create input. The SDK adds `type: "manual"` for you.
 */
export interface BlogPostCreateInput {
  title: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  meta_title?: string;
  meta_description?: string;
  language_code?: string;
  category_id?: number;
  /**
   * Existing tag ids. Note the API field is `tags`, not `tag_ids`.
   */
  tags?: number[];
  featured_image?: string;
  status?: "draft" | "published" | "scheduled";
}

export interface BlogPostUpdateInput {
  title?: string;
  content?: string;
  excerpt?: string;
  meta_title?: string | null;
  meta_description?: string | null;
  slug?: string;
  category_id?: number;
  featured_image?: string;
  status?: "draft" | "published" | "scheduled";
  language_code?: string;
  tags?: number[];
}

/**
 * AI blog-post generation input. The SDK adds `type: "ai"` for you.
 *
 * Note: the controller currently only honours `translate_to_all` (boolean) —
 * there is no per-language list parameter on `POST /blog-posts`. To translate
 * an existing post to specific languages use `client.blogPosts.translate(id, [..])`.
 */
export interface BlogAiInput {
  topic: string;
  style?: "professional" | "casual" | "educational" | "thought_leadership" | "storytelling";
  word_count?: number;
  target_audience?: string;
  primary_keyword?: string;
  secondary_keywords?: string[];
  /** Auto-translate the result into every target language configured on the project. */
  translate_to_all?: boolean;
  enable_research?: boolean;
  research_depth?: "light" | "standard" | "deep";
  image_style?: "photo" | "illustration" | "abstract";
  additional_instructions?: string;
}

// -------------------- Images --------------------

export interface ImageGenerateInput {
  prompt: string;
  /** Allowed by the API: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3 */
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "3:2" | "2:3";
  style?: string;
  /** If provided, the resulting image is also addressable as `GET /images/{key}`. */
  key?: string;
}

export interface Image {
  key: string;
  url: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface ImageReplaceUrlInput {
  url: string;
}

export interface ImageReplaceRegenerateInput {
  regenerate: true;
  prompt: string;
  aspect_ratio?: ImageGenerateInput["aspect_ratio"];
  style?: string;
}

export type ImageReplaceInput = ImageReplaceUrlInput | ImageReplaceRegenerateInput;

export interface ImageListParams {
  page?: number;
  page_size?: number;
  prefix?: string;
}

/**
 * Either a Web `File` / `Blob` (browser, Bun, Node 20+) or a Node `Buffer` /
 * `Uint8Array`. The SDK transports it as multipart/form-data.
 */
export type ImageUploadFile = File | Blob | ArrayBuffer | Uint8Array;

export interface ImageUploadOptions {
  /** Filename to send to the server. Required for non-File inputs. */
  filename?: string;
  /** MIME type. Defaults to `application/octet-stream` if not derivable. */
  contentType?: string;
}

// -------------------- Products --------------------

export type ProductStatus = "draft" | "active" | "archived";
export type ProductType = "physical" | "digital" | "service";

export interface ProductVariant {
  id: number;
  product_id: number;
  name: string;
  sku?: string | null;
  /** Price in minor units (e.g. cents). */
  price: number;
  stock_quantity?: number | null;
  options?: Record<string, string>;
  sort_order?: number;
  is_active?: boolean;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  short_description?: string | null;
  /** Price in minor units (e.g. cents). */
  price: number;
  /** Comparison/list price in minor units (e.g. cents). */
  compare_at_price?: number | null;
  currency: string;
  type?: ProductType;
  status: ProductStatus;
  sku?: string | null;
  stock_quantity?: number | null;
  track_inventory?: boolean;
  weight?: number | null;
  images?: string[];
  metadata?: Record<string, unknown>;
  category_id?: number | null;
  featured?: boolean;
  published_at?: string | null;
  variants?: ProductVariant[];
  created_at?: string;
  updated_at?: string;
}

export interface ProductCreateInput {
  name: string;
  slug?: string;
  description?: string;
  short_description?: string;
  /** Price in minor units (e.g. cents). */
  price: number;
  /** Comparison/list price in minor units (e.g. cents). */
  compare_at_price?: number | null;
  currency?: string;
  type?: ProductType;
  status?: ProductStatus;
  sku?: string;
  stock_quantity?: number | null;
  track_inventory?: boolean;
  weight?: number | null;
  images?: string[];
  category_id?: number | null;
  featured?: boolean;
  published_at?: string;
  metadata?: Record<string, unknown>;
}

// -------------------- Booking --------------------

export type BookableServiceStatus = "active" | "inactive";
export type BookingType = "time_slot" | "date_range";

export interface BookableService {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  short_description?: string | null;
  /** Price in minor units (e.g. cents). */
  price: number;
  currency: string;
  booking_type?: BookingType;
  duration_minutes?: number;
  buffer_before_minutes?: number;
  buffer_after_minutes?: number;
  max_bookings_per_slot?: number;
  min_notice_hours?: number;
  max_advance_days?: number;
  cancellation_hours?: number;
  min_nights?: number | null;
  max_nights?: number | null;
  status: BookableServiceStatus;
  color?: string | null;
  images?: string[];
  sort_order?: number;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

/**
 * Convenience structure returned by `client.booking.getWidget()`. The widget
 * endpoint itself returns JavaScript; the SDK wraps it in the URL plus a
 * paste-ready `<script>` snippet for HTML embedding.
 */
export interface BookingWidgetEmbed {
  embed_html: string;
  snippet_url: string;
  service_id: string | number;
}

// -------------------- Jobs --------------------

export type JobStatus = "pending" | "processing" | "completed" | "failed" | "cancelled";

export type JobType =
  | "blog_post.generate"
  | "social_post.generate"
  | "image.generate"
  | "translation.batch"
  | "translation"
  | "content_plan.generate"
  | "website.generate"
  | "video.generate"
  | "post"
  | "image"
  | string;

export interface JobStep {
  name: string;
  completed?: boolean;
  active?: boolean;
}

export interface JobReference {
  id: string | number;
  type: JobType;
  status: JobStatus;
  progress?: number;
  message?: string;
  steps?: JobStep[];
  result?: Record<string, unknown> | null;
  error?: { code: string; message: string } | string | null;
  created_at: string;
  updated_at?: string;
}

// -------------------- Pages --------------------

export type PageType = "landing" | "blog_list" | "blog_post" | "legal";

export interface Page {
  id: number;
  slug: string;
  title: string;
  type: PageType;
  is_homepage: boolean;
  is_active: boolean;
  exclude_from_search?: boolean;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image: string | null;
  canonical_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PageCreateInput {
  slug: string;
  title: string;
  type?: PageType;
  is_homepage?: boolean;
  is_active?: boolean;
  exclude_from_search?: boolean;
  meta_title?: string;
  meta_description?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  canonical_url?: string;
}

/**
 * Patch shape — every field is optional. Pass `null` on a meta field to
 * clear it. Untouched fields are preserved (server merges meta).
 */
export interface PageUpdateInput {
  slug?: string;
  title?: string;
  type?: PageType;
  is_homepage?: boolean;
  is_active?: boolean;
  exclude_from_search?: boolean;
  meta_title?: string | null;
  meta_description?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image?: string | null;
  canonical_url?: string | null;
}

export interface PageListParams {
  page?: number;
  page_size?: number;
  type?: PageType;
  is_active?: boolean;
}

// -------------------- Galleries --------------------

/**
 * Named, ordered collection of images. Slug is the stable identifier;
 * names can change. Items are full-replaced on every update — to add or
 * reorder, fetch the current `items` array, mutate, then send the whole
 * new list back. Max 200 items per gallery.
 */
export interface GalleryItem {
  url: string;
  /** Alt text; `null` when absent. */
  alt: string | null;
}

export interface Gallery {
  slug: string;
  name: string;
  items: GalleryItem[];
  items_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface GalleryCreateInput {
  name: string;
  /**
   * Optional explicit slug. Must match /^[a-z0-9][a-z0-9-]{0,254}$/.
   * Omit to auto-derive from `name`. On collision the server appends
   * -2, -3, … to find a free slug.
   */
  slug?: string;
  items?: GalleryItem[];
}

export interface GalleryUpdateInput {
  name?: string;
  /** Full replace of the ordered items list. Max 200 entries. */
  items?: GalleryItem[];
}

export interface GalleryListParams {
  page?: number;
  /** Items per page (1–100). Default 20. */
  per_page?: number;
}

// -------------------- Webhooks --------------------

/**
 * The set of event names accepted by `POST /v1/webhook-endpoints` is a
 * server-side whitelist (`WebhookEndpointController::VALID_EVENTS`). Any
 * value outside this list will be rejected with a 422 validation error.
 *
 * Notably absent: `newsletter.subscribed` and `contact_form.submitted` are
 * NOT currently delivered as webhooks even though those events fire
 * internally.
 */
export type WebhookEvent =
  | "blog_post.published"
  | "blog_post.translated"
  | "social_post.published"
  | "social_post.failed"
  | "order.created"
  | "order.paid"
  | "order.fulfilled"
  | "order.cancelled"
  | "order.refunded"
  | "booking.confirmed"
  | "booking.cancelled"
  | "booking.completed"
  | "content.changed"
  | "image.generated"
  | "connect.account_updated";

// -------------------- Central / multi-tenant login --------------------

/**
 * Tenant entry returned by the central `tenants-for-email` lookup — used by
 * the central-login workspace picker when an email is registered against
 * more than one project.
 */
export interface TenantForEmail {
  id: string | number;
  name: string;
  domain: string | null;
}

export interface TenantsForEmailResponse {
  tenants: TenantForEmail[];
}
