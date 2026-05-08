import { describe, it, expect } from "vitest";
import { unwrapResource } from "../src/client.js";

describe("unwrapResource", () => {
  it("returns null as-is", () => {
    expect(unwrapResource(null)).toBeNull();
  });

  it("returns primitive scalars as-is", () => {
    expect(unwrapResource("hello")).toBe("hello");
    expect(unwrapResource(42)).toBe(42);
    expect(unwrapResource(true)).toBe(true);
  });

  it("returns arrays as-is (unwrap is not recursive)", () => {
    const arr = [{ data: "nested" }];
    expect(unwrapResource(arr)).toBe(arr);
  });

  it("unwraps a single-resource {data: X} envelope", () => {
    const inner = { id: 1, name: "Mat" };
    expect(unwrapResource({ data: inner })).toBe(inner);
  });

  it("preserves a paginated list {data: X, meta: Y}", () => {
    const env = {
      data: [{ id: 1 }, { id: 2 }],
      meta: { page: 1, page_size: 20, total: 2 },
    };
    expect(unwrapResource(env)).toBe(env);
  });

  it("unwraps a {job: X} image-controller envelope", () => {
    const job = { id: "job_x", type: "image.generate", status: "pending" };
    expect(unwrapResource({ job })).toBe(job);
  });

  it("does NOT unwrap when {data} sits alongside other top-level keys (just data + something extra)", () => {
    // E.g. the spec's content/bulk response is a flat key→value map, not
    // wrapped in `{data: ...}`. We don't want to mangle anything that has
    // both `data` and arbitrary other keys (that's not a JsonResource shape).
    const obj = { data: "x", other: "y" };
    expect(unwrapResource(obj)).toBe(obj);
  });

  it("does not unwrap when {job} sits alongside other keys", () => {
    const obj = { job: { id: "x" }, extra: 1 };
    expect(unwrapResource(obj)).toBe(obj);
  });

  it("returns plain objects as-is", () => {
    const obj = { key: "hero.headline", value: "Hi", lang: "en" };
    expect(unwrapResource(obj)).toBe(obj);
  });
});
