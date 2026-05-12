/**
 * Public entry point for `@neuraldraft/sdk`.
 *
 * @example
 *   import { NeuralDraftClient } from "@neuraldraft/sdk";
 *
 *   const nd = new NeuralDraftClient({ apiKey: process.env.NEURALDRAFT_API_KEY! });
 *   const brand = await nd.brand.get();
 */

export { NeuralDraftClient, type NeuralDraftClientOptions } from "./client.js";
export { ApiError } from "./errors.js";

export type {
  // Pagination
  Paginated,
  PaginationMeta,

  // Project
  Project,
  ProjectPlan,
  ProjectUpdateInput,
  ProjectUsage,
  ProjectUsageBreakdownEntry,

  // Brand
  BrandColor,
  BrandColors,
  BrandContentTone,
  BrandContext,
  BrandFonts,
  BrandLanguage,

  // Content
  ContentScope,
  ContentValue,
  TranslationKeyCreateResult,

  // Components
  ComponentRegisterInput,
  ComponentUpdateInput,
  RegisteredComponent,

  // Blog
  BlogAiInput,
  BlogPost,
  BlogPostCreateInput,
  BlogPostStatus,
  BlogPostTranslation,
  BlogPostUpdateInput,
  Category,
  Tag,

  // Pages
  Page,
  PageCreateInput,
  PageListParams,
  PageType,
  PageUpdateInput,

  // Galleries
  Gallery,
  GalleryCreateInput,
  GalleryItem,
  GalleryListParams,
  GalleryUpdateInput,

  // Images
  Image,
  ImageGenerateInput,
  ImageListParams,
  ImageReplaceInput,
  ImageReplaceRegenerateInput,
  ImageReplaceUrlInput,
  ImageUploadFile,
  ImageUploadOptions,

  // Products
  Product,
  ProductCreateInput,
  ProductStatus,
  ProductType,
  ProductVariant,

  // Booking
  BookableService,
  BookableServiceStatus,
  BookingType,
  BookingWidgetEmbed,

  // Jobs
  JobReference,
  JobStatus,
  JobStep,
  JobType,

  // Webhooks
  WebhookEvent,

  // Central / multi-tenant login
  TenantForEmail,
  TenantsForEmailResponse,
} from "./types.js";
