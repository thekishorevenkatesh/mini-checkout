import type { Product } from "../types";

/** Parse category tags from legacy comma string or array field */
export function parseCategoryTags(raw: string) {
  return String(raw || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function joinCategoryTags(tags: string[]) {
  return tags.map((tag) => tag.trim()).filter(Boolean).join(", ");
}

type CategorySource = Pick<Product, "category" | "categories">;

/** All unique category tags for a product */
export function getProductCategories(product: CategorySource): string[] {
  const fromArray = Array.isArray(product.categories)
    ? product.categories.map((tag) => String(tag || "").trim()).filter(Boolean)
    : [];
  const fromLegacy = parseCategoryTags(product.category || "");
  return [...new Set([...fromArray, ...fromLegacy])];
}

/** Whether a product belongs to a catalog / store category tab */
export function productMatchesCategory(product: CategorySource, category: string) {
  const filter = String(category || "").trim();
  if (!filter) return true;
  const normalized = filter.toLowerCase();
  return getProductCategories(product).some((tag) => tag.toLowerCase() === normalized);
}

/** Distinct category tabs across a product list */
export function collectCategoryTabs(products: CategorySource[]) {
  const tags = products.flatMap((product) => getProductCategories(product));
  return [...new Set(tags)];
}

/** Group products — each product listed under every category it has */
export function groupProductsByCategory(products: Product[]) {
  const map = new Map<string, Product[]>();

  for (const product of products) {
    const tags = getProductCategories(product);
    if (tags.length === 0) {
      const bucket = "Other";
      if (!map.has(bucket)) map.set(bucket, []);
      map.get(bucket)!.push(product);
      continue;
    }

    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)!.push(product);
    }
  }

  return map;
}
