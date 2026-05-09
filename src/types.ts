/**
 * TypeScript types for the Neural Draft Project API v1.
 *
 * Mirrors the schemas defined in the canonical OpenAPI spec at
 * https://github.com/neuraldraft/neuraldraft/blob/main/openapi.yaml.
 * Field optionality follows the spec's `required` arrays — anything the spec
 * marks as nullable is `T | null`; anything not in `required` is `T | undefined`
 * (i.e. an optional property).
 */

// -------------------- Pagination --------------------

export interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

// -------------------- Project --------------------

export type ProjectPlan = "free" | "hobby" | "build" | "scale" | "enterprise";

export interface Project {
  id: string;
  name: string;
  slug: string;
  industry?: string | null;
  default_language: string;
  target_languages: string[];
  timezone?: string;
  plan: ProjectPlan;
  created_at: string;
}

// -------------------- Brand --------------------

export interface BrandColor {
  hex: string;
  name?: string | null;
}

export type BrandContentTone =
  | "friendly_professional"
  | "formal"
  | "playful"
  | "authoritative"
  | "warm"
  | "witty";

export interface BrandFonts {
  heading?: string;
  body?: string;
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

export interface BrandContext {
  voice?: string | null;
  audience?: string | null;
  content_tone?: BrandContentTone | null;
  content_goals?: string[] | null;
  preferred_topics?: string[] | null;
  description?: string | null;
  logo_url?: string | null;
  colors?: BrandColors | null;
  fonts?: BrandFonts | null;
  industry?: string | null;
  languages?: BrandLanguage[];
}

// -------------------- Content --------------------

export interface ContentValue {
  key: string;
  value: string;
  lang: string;
  all_locales?: Record<string, string>;
}

export interface TranslationKeyCreateResult {
  created: string[];
  skipped_existing: string[];
}

// -------------------- Components --------------------

export interface RegisteredComponent {
  id: string;
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
  page_slug?: string;
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

export interface BlogPostCreateInput {
  title: string;
  slug?: string;
  content: string;
  excerpt?: string;
  meta_title?: string;
  meta_description?: string;
  language_code: string;
  category_id?: number;
  tag_ids?: number[];
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

export interface BlogAiInput {
  topic: string;
  style?: string;
  word_count?: number;
  target_audience?: string;
  primary_keyword?: string;
  secondary_keywords?: string[];
  /**
   * ISO codes the AI should also produce localized versions in. The SDK
   * forwards these to the API as `ai.translate_to_languages`.
   */
  translate_to?: string[];
  translate_to_all?: boolean;
  enable_research?: boolean;
  research_depth?: "shallow" | "normal" | "deep";
  reference_urls?: string[];
  image_style?: string;
  additional_instructions?: string;
  category_id?: number;
  tag_ids?: number[];
}

// -------------------- Images --------------------

export interface ImageGenerateInput {
  prompt: string;
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "4:5" | "4:3" | "3:2";
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
  price: number;
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
  price: number;
  compare_at_price?: number | null;
  currency: string;
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
  | "content_plan.generate"
  | "website.generate";

export interface JobStep {
  name: string;
  completed?: boolean;
  active?: boolean;
}

export interface JobReference {
  id: string;
  type: JobType;
  status: JobStatus;
  progress?: number;
  message?: string;
  steps?: JobStep[];
  result?: Record<string, unknown> | null;
  error?: { code: string; message: string } | null;
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
