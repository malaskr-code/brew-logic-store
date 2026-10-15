import { getCatalogCollections } from "../catalog-service";
import { seedProducts, seedBundles } from "../catalog-seed";
import { closeMongoDatabase } from "../mongo";
import { logger } from "../logger";

async function seed() {
  const collections = await getCatalogCollections();
  for (const kind of ["product", "bundle"] as const) {
    const collection = kind === "product" ? collections.products : collections.bundles;
    if (await collection.countDocuments({}) !== 0) {
      logger.info({ collection: collection.collectionName }, "Seed skipped: collection is not empty");
      continue;
    }
    const records = kind === "product" ? seedProducts : seedBundles;
    const now = new Date();
    await collection.bulkWrite(records.map((record, sortOrder) => ({
      updateOne: {
        filter: { id: record.id },
        update: { $setOnInsert: { ...record, kind, sortOrder, createdAt: now, updatedAt: now } },
        upsert: true,
      },
    })));
    logger.info({ collection: collection.collectionName, count: records.length }, "Seed completed");
  }
}

seed().catch(() => {
  logger.error("Catalog seed failed. Check the MongoDB connection.");
  process.exitCode = 1;
}).finally(closeMongoDatabase);
