import { MongoClient, MongoServerError, type Collection } from "mongodb";
import { GetCatalogResponse, type CatalogEntryInput } from "@workspace/api-zod";
import { seedProducts, seedBundles } from "./catalog-seed";

type CatalogDocument = CatalogEntryInput & { createdAt: Date; updatedAt: Date; sortOrder: number };
let connection: Promise<Collection<CatalogDocument>> | undefined;

export class CatalogConflictError extends Error {}
export class CatalogInputError extends Error {}

async function catalogCollection() {
  if (!connection) {
    connection = (async () => {
      const uri = process.env.MONGODB_URI;
      if (!uri) throw new Error("MongoDB is not configured");
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 });
      try {
        await client.connect();
        const uriDatabase = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/)?.[1];
        const db = client.db(uriDatabase ? decodeURIComponent(uriDatabase) : "brew_logic");
        const collection = db.collection<CatalogDocument>("catalog");
        await collection.createIndex({ id: 1 }, { unique: true });
        const metadata = db.collection<{ _id: string; seededAt: Date }>("catalog_metadata");
        if (!await metadata.findOne({ _id: "initial-catalog" })) {
          if (await collection.countDocuments({}) === 0) {
            const now = new Date();
            const entries: CatalogDocument[] = [
              ...seedProducts.map((product, sortOrder) => ({ ...product, kind: "product" as const, sortOrder, createdAt: now, updatedAt: now })),
              ...seedBundles.map((bundle, index) => ({ ...bundle, kind: "bundle" as const, sortOrder: seedProducts.length + index, createdAt: now, updatedAt: now })),
            ];
            await collection.bulkWrite(entries.map(entry => ({ updateOne: { filter: { id: entry.id }, update: { $setOnInsert: entry }, upsert: true } })));
          }
          await metadata.updateOne({ _id: "initial-catalog" }, { $setOnInsert: { seededAt: new Date() } }, { upsert: true });
        }
        return collection;
      } catch (error) {
        await client.close().catch(() => undefined);
        throw error;
      }
    })().catch(error => { connection = undefined; throw error; });
  }
  return connection;
}

export async function getCatalog() {
  const collection = await catalogCollection();
  const entries = await collection.find({}).sort({ sortOrder: 1, id: 1 }).toArray();
  return GetCatalogResponse.parse({
    products: entries.filter(entry => entry.kind === "product"),
    bundles: entries.filter(entry => entry.kind === "bundle"),
  });
}

async function validateEntry(entry: CatalogEntryInput, collection: Collection<CatalogDocument>) {
  if (!entry.name.trim() || !entry.id.trim()) throw new CatalogInputError("Name and identifier are required.");
  if (entry.kind === "bundle") {
    if (entry.regular < entry.price) throw new CatalogInputError("Regular price must be at least the bundle price.");
    const names = await collection.find({ kind: "product", name: { $in: entry.items } }).project({ name: 1 }).toArray();
    if (entry.items.some(name => !names.some(product => product.name === name))) {
      throw new CatalogInputError("Bundle items must be product names from the catalog.");
    }
  } else if (/^[a-z]+:/i.test(entry.image) && !entry.image.startsWith("https://")) {
    throw new CatalogInputError("Use an existing image key or an HTTPS image URL.");
  }
  if (entry.kind === "product" && await collection.findOne({ kind: "product", name: entry.name, id: { $ne: entry.id } })) {
    throw new CatalogConflictError("A product with that name already exists.");
  }
}

export async function createCatalogEntry(entry: CatalogEntryInput) {
  const collection = await catalogCollection();
  await validateEntry(entry, collection);
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
  const collection = await catalogCollection();
  await validateEntry(entry, collection);
  const previous = await collection.findOne({ id });
  if (!previous) return null;
  if (entry.kind !== previous.kind) throw new CatalogInputError("An existing entry's type cannot be changed.");
  await collection.replaceOne({ id }, { ...entry, createdAt: previous.createdAt, sortOrder: previous.sortOrder, updatedAt: new Date() });
  if (previous.kind === "product" && entry.kind === "product" && previous.name !== entry.name) {
    await collection.updateMany({ kind: "bundle", items: previous.name }, { $set: { "items.$[item]": entry.name, updatedAt: new Date() } }, { arrayFilters: [{ item: previous.name }] });
  }
  return entry;
}

export async function deleteCatalogEntry(id: string) {
  const collection = await catalogCollection();
  const previous = await collection.findOne({ id });
  if (!previous) return false;
  if (previous.kind === "product" && await collection.findOne({ kind: "bundle", items: previous.name })) {
    throw new CatalogConflictError("Remove this product from its bundles before deleting it.");
  }
  return (await collection.deleteOne({ id })).deletedCount === 1;
}
