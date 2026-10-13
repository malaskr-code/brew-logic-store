import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes, randomUUID } from "node:crypto";
import { MongoServerError, ObjectId, type Collection } from "mongodb";
import type { CustomerUser } from "@workspace/api-zod";
import { getMongoDatabase } from "./mongo";

type UserDocument = { _id: ObjectId; name: string; email: string; passwordHash: string; createdAt: Date };
export const CUSTOMER_COOKIE = "__Host-brew_customer";
export const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000;
export const customerCookieOptions = { httpOnly: true, secure: true, sameSite: "lax" as const, path: "/" };
let usersPromise: Promise<Collection<UserDocument>> | undefined;
const dummyHash = bcrypt.hash(randomBytes(32).toString("hex"), 12);

export class EmailInUseError extends Error {}
export class InvalidCredentialsError extends Error {}

function signingKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Customer session signing is not configured");
  return secret;
}

async function usersCollection() {
  if (!usersPromise) usersPromise = (async () => {
    const users = (await getMongoDatabase()).collection<UserDocument>("users");
    await users.createIndex({ email: 1 }, { unique: true });
    return users;
  })().catch(error => { usersPromise = undefined; throw error; });
  return usersPromise;
}

function publicUser(user: Pick<UserDocument, "_id" | "name" | "email" | "createdAt">): CustomerUser {
  return { id: user._id.toHexString(), name: user.name, email: user.email, createdAt: user.createdAt };
}

function issueSession(user: UserDocument) {
  const token = jwt.sign({}, signingKey(), {
    algorithm: "HS256", subject: user._id.toHexString(), issuer: "brew-logic",
    audience: "brew-logic-customer", expiresIn: "7d", jwtid: randomUUID(),
  });
  return { user: publicUser(user), token };
}

export async function signupCustomer(input: { name: string; email: string; password: string }) {
  signingKey();
  const users = await usersCollection();
  const email = input.email.trim().toLowerCase();
  if (await users.findOne({ email }, { projection: { _id: 1 } })) throw new EmailInUseError();
  const user: UserDocument = {
    _id: new ObjectId(), name: input.name.trim(), email,
    passwordHash: await bcrypt.hash(input.password, 12), createdAt: new Date(),
  };
  try { await users.insertOne(user); } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) throw new EmailInUseError();
    throw error;
  }
  return issueSession(user);
}

export async function loginCustomer(input: { email: string; password: string }) {
  signingKey();
  const users = await usersCollection();
  const user = await users.findOne({ email: input.email.trim().toLowerCase() });
  const hash = user && typeof user.passwordHash === "string" ? user.passwordHash : await dummyHash;
  const correct = await bcrypt.compare(input.password, hash);
  if (!user || !correct) throw new InvalidCredentialsError();
  return issueSession(user);
}

export async function getCustomerSession(token: string | undefined) {
  if (!token) return null;
  const key = signingKey();
  let claims: jwt.JwtPayload;
  try {
    const verified = jwt.verify(token, key, { algorithms: ["HS256"], issuer: "brew-logic", audience: "brew-logic-customer" });
    if (typeof verified === "string" || typeof verified.sub !== "string" || !/^[a-f0-9]{24}$/.test(verified.sub)) return null;
    claims = verified;
  } catch { return null; }
  const user = await (await usersCollection()).findOne({ _id: new ObjectId(claims.sub) }, { projection: { passwordHash: 0 } });
  return user ? publicUser(user) : null;
}

export class AuthAttemptLimiter {
  private attempts = new Map<string, { count: number; expires: number }>();
  allow(key: string, limit: number, window: number, now = Date.now()) {
    const previous = this.attempts.get(key);
    if (previous && previous.expires > now) {
      if (previous.count >= limit) return false;
      previous.count++;
      return true;
    }
    if (this.attempts.size >= 10000) {
      for (const [entry, value] of this.attempts) if (value.expires <= now) this.attempts.delete(entry);
      if (this.attempts.size >= 10000) return false;
    }
    this.attempts.set(key, { count: 1, expires: now + window });
    return true;
  }
}
