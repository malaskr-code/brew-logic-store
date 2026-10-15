import { MongoServerError } from "mongodb";
import { GetProductsResponse, GetBundlesResponse, type CatalogEntryInput } from "@workspace/api-zod";
import { getMongoDatabase } from "./mongo";

type CatalogDocument = CatalogEntryInput & { createdAt: Date; updatedAt: Date; sortOrder: number };
let initialization: Promise<void> | undefined;

export class CatalogConflictError extends Error {}
export class CatalogInputError extends Error {}

export async function getCatalogCollections() {
  const db = await getMongoDatabase();
  const products = db.collection<CatalogDocument>("products");
  const bundles = db.collection<CatalogDocument>("bundles");
  if (!initialization) {
    initialization = (async () => {
      await Promise.all([products.createIndex({ id: 1 }, { unique: true }), bundles.createIndex({ id: 1 }, { unique: true })]);
      const metadata = db.collection<{ _id: string; migratedAt: Date }>("catalog_metadata");
      if (!await metadata.findOne({ _id: "separate-products-and-bundles" })) {
        // Preserve every live edit; keep the old collection as a backup, never as a runtime fallback.
        const legacy = db.collection<CatalogDocument>("catalog");
        for (const [kind, target] of [["product", products], ["bundle", bundles]] as const) {
          if (await target.countDocuments({}) === 0) {
            const old = await legacy.find({ kind }).toArray();
            if (old.length) await target.bulkWrite(old.map(({ _id, ...entry }) => ({
              updateOne: { filter: { id: entry.id }, update: { $setOnInsert: entry }, upsert: true },
            })));
          }
        }
        await metadata.updateOne({ _id: "separate-products-and-bundles" }, { $setOnInsert: { migratedAt: new Date() } }, { upsert: true });
      }
    })().catch(error => { initialization = undefined; throw error; });
  }
  await initialization;
  return { products, bundles };
}

export async function getProducts() {
  const { products } = await getCatalogCollections();
  return GetProductsResponse.parse(await products.find({}).sort({ sortOrder: 1, id: 1 }).toArray());
}

export async function getBundles() {
  const { bundles } = await getCatalogCollections();
  return GetBundlesResponse.parse(await bundles.find({}).sort({ sortOrder: 1, id: 1 }).toArray());
}

export async function getCatalog() {
  const [products, bundles] = await Promise.all([getProducts(), getBundles()]);
  return { products, bundles };
}

async function validateEntry(entry: CatalogEntryInput) {
  const { products } = await getCatalogCollections();
  if (!entry.name.trim() || !entry.id.trim()) throw new CatalogInputError("Name and identifier are required.");
  if (entry.kind === "bundle") {
    if (entry.regular < entry.price) throw new CatalogInputError("Regular price must be at least the bundle price.");
    const names = await products.find({ name: { $in: entry.items } }).project({ name: 1 }).toArray();
    if (entry.items.some(name => !names.some(product => product.name === name))) {
      throw new CatalogInputError("Bundle items must be product names from the catalog.");
    }
  } else if (/^[a-z]+:/i.test(entry.image) && !entry.image.startsWith("https://")) {
    throw new CatalogInputError("Use an existing image key or an HTTPS image URL.");
  }
  if (entry.kind === "product" && await products.findOne({ name: entry.name, id: { $ne: entry.id } })) {
    throw new CatalogConflictError("A product with that name already exists.");
  }
}

export async function createCatalogEntry(entry: CatalogEntryInput) {
  const { products, bundles } = await getCatalogCollections();
  const collection = entry.kind === "product" ? products : bundles;
  if (await (entry.kind === "product" ? bundles : products).findOne({ id: entry.id })) {
    throw new CatalogConflictError("That identifier is already in use.");
  }
  await validateEntry(entry);
  const last = await collection.find({}).sort({ sortOrder: -1 }).limit(1).next();
  const now = new Date();
  try {
    await collection.insertOne({ ...entry, sortOrder: (last?.sortOrder ?? -1) + 1, createdAt: now, updatedAt: now });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw new CatalogConflictError("That identifier is already in use.");
    throw error;
  }
  return entry;
}

export async function updateCatalogEntry(id: string, entry: CatalogEntryInput) {
  if (entry.id !== id) throw new CatalogInputError("An existing identifier cannot be changed.");
  const { products, bundles } = await getCatalogCollections();
  const collection = entry.kind === "product" ? products : bundles;
  await validateEntry(entry);
  const previous = await collection.findOne({ id });
  if (!previous) return null;
  if (entry.kind !== previous.kind) throw new CatalogInputError("An existing entry's type cannot be changed.");
  await collection.replaceOne({ id }, { ...entry, createdAt: previous.createdAt, sortOrder: previous.sortOrder, updatedAt: new Date() });
  if (previous.kind === "product" && entry.kind === "product" && previous.name !== entry.name) {
    await bundles.updateMany({ items: previous.name }, { $set: { "items.$[item]": entry.name, updatedAt: new Date() } }, { arrayFilters: [{ item: previous.name }] });
  }
  return entry;
}

export async function deleteCatalogEntry(id: string) {
  const { products, bundles } = await getCatalogCollections();
  const previous = await products.findOne({ id }) ?? await bundles.findOne({ id });
  if (!previous) return false;
  if (previous.kind === "product" && await bundles.findOne({ items: previous.name })) {
    throw new CatalogConflictError("Remove this product from its bundles before deleting it.");
  }
  return (await (previous.kind === "product" ? products : bundles).deleteOne({ id })).deletedCount === 1;
}
