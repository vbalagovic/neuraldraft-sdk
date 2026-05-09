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

  // Brand
  BrandColor,
  BrandColors,
  BrandContentTone,
  BrandContext,
  BrandFonts,
  BrandLanguage,

  // Content
  ContentValue,
  TranslationKeyCreateResult,

  // Components
  ComponentRegisterInput,
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
} from "./types.js";
