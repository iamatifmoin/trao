import { MongoClient, ObjectId, type Db } from "mongodb";

let client: MongoClient | null = null;
let db: Db | null = null;

export async function connectToMongo(uri: string): Promise<Db> {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db();

  await db.collection("users").createIndex({ email: 1 }, { unique: true });
  await db.collection("kits").createIndex({ userId: 1, dedupeKey: 1 }, { unique: true });
  await db.collection("kits").createIndex({ userId: 1, createdAt: -1 });

  return db;
}

export function getDb(): Db {
  if (!db) throw new Error("Mongo is not connected yet — call connectToMongo() before handling requests");
  return db;
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}

export { ObjectId };
