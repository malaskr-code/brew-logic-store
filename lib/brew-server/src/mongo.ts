import { MongoClient, type Db } from "mongodb";

let client: MongoClient | undefined;
let connection: Promise<Db> | undefined;

export function getMongoDatabase(): Promise<Db> {
  if (!connection) {
    connection = (async () => {
      const uri = process.env.MONGODB_URI;
      if (!uri) throw new Error("MongoDB is not configured");
      const candidate = new MongoClient(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 });
      try {
        await candidate.connect();
        const database = uri.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]*)/)?.[1];
        client = candidate;
        return candidate.db(database ? decodeURIComponent(database) : "brew_logic");
      } catch (error) {
        await candidate.close().catch(() => undefined);
        throw error;
      }
    })().catch(error => { connection = undefined; throw error; });
  }
  return connection;
}

export async function closeMongoDatabase() {
  await client?.close();
  client = undefined;
  connection = undefined;
}
