import { test } from "node:test";
import assert from "node:assert/strict";
import { ObjectId, type Collection } from "mongodb";
import type { CustomerDocument } from "./customer-auth";
import {
  createCustomerVerification, hashVerificationToken, InvalidVerificationError,
  VerificationRateLimitError, EmailDeliveryUnavailableError, unavailableVerificationSender,
  VERIFICATION_TTL_MS, RESEND_COOLDOWN_MS, type VerificationMessage, type VerificationSender,
} from "./customer-verification";

// Minimal Mongo double exercises the same compare-and-swap filters. No test
// users or messages are inserted into the project's real database.
function fixture(sender?: VerificationSender, legacy = false) {
  let time = Date.UTC(2026, 9, 13);
  const doc: CustomerDocument = {
    _id: new ObjectId(), name: "Verification test", email: "test@example.invalid",
    passwordHash: "not-used", createdAt: new Date(time),
    ...(legacy ? {} : { emailVerifiedAt: null }),
  };
  const messages: VerificationMessage[] = [];
  const matches = (filter: Record<string, unknown>) => Object.entries(filter).every(([key, value]) => {
    const actual = (doc as unknown as Record<string, unknown>)[key];
    if (value === null) return actual == null;
    if (value instanceof ObjectId) return doc._id.equals(value);
    if (value instanceof Date) return actual instanceof Date && actual.getTime() === value.getTime();
    if (typeof value === "object" && value !== null) {
      if ("$exists" in value) return (actual !== undefined) === value.$exists;
      if ("$gt" in value) return actual instanceof Date && actual > (value.$gt as Date);
    }
    return actual === value;
  });
  const collection = {
    async findOne(filter: Record<string, unknown>) { return matches(filter) ? { ...doc } : null; },
    async updateOne(filter: Record<string, unknown>, update: { $set?: object; $unset?: object }) {
      if (!matches(filter)) return { modifiedCount: 0 };
      Object.assign(doc, update.$set);
      for (const key of Object.keys(update.$unset ?? {})) delete (doc as unknown as Record<string, unknown>)[key];
      return { modifiedCount: 1 };
    },
  } as unknown as Collection<CustomerDocument>;
  const service = createCustomerVerification(async () => collection, sender ?? (async msg => { messages.push(msg); }), () => time);
  return { doc, messages, service, newService: () => createCustomerVerification(async () => collection, async msg => { messages.push(msg); }, () => time), advance: (ms: number) => { time += ms; } };
}

test("only a token hash is persisted; confirmation is single-use and grants no session", async () => {
  const { service, doc, messages } = fixture();
  assert.equal((await service.resend(doc._id.toHexString())).status, "sent");
  const token = messages[0].token;
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(doc.verificationTokenHash, hashVerificationToken(token));
  assert.notEqual(doc.verificationTokenHash, token);
  assert.equal(JSON.stringify(doc).includes(token), false);
  assert.deepEqual(await service.confirm(token), { status: "verified" });
  assert.ok(doc.emailVerifiedAt instanceof Date);
  assert.equal(doc.verificationTokenHash, undefined);
  assert.equal(doc.verificationExpiresAt, undefined);
  await assert.rejects(service.confirm(token), InvalidVerificationError);
  assert.deepEqual(await service.resend(doc._id.toHexString()), { status: "already_verified", retryAfterSeconds: 0 });
  assert.equal(messages.length, 1);
});

test("legacy accounts are not implicitly verified", async () => {
  const { service, doc, messages } = fixture(undefined, true);
  assert.equal(doc.emailVerifiedAt, undefined);
  await service.resend(doc._id.toHexString());
  await service.confirm(messages[0].token);
  assert.ok(doc.emailVerifiedAt);
});

test("expired, malformed, and superseded tokens cannot verify", async () => {
  const { service, doc, messages, advance } = fixture();
  await service.resend(doc._id.toHexString());
  const old = messages[0].token;
  advance(RESEND_COOLDOWN_MS);
  await service.resend(doc._id.toHexString());
  await assert.rejects(service.confirm(old), InvalidVerificationError);
  await assert.rejects(service.confirm("bad-token"), InvalidVerificationError);
  advance(VERIFICATION_TTL_MS);
  await assert.rejects(service.confirm(messages[1].token), InvalidVerificationError);
  assert.equal(doc.emailVerifiedAt, null);
});

test("resends have durable cooldown and hourly limits, including across service instances", async () => {
  const { service, doc, messages, advance, newService } = fixture();
  const id = doc._id.toHexString();
  await service.resend(id);
  await assert.rejects(newService().resend(id), (error: unknown) => error instanceof VerificationRateLimitError && error.retryAfterSeconds === 60);
  for (let i = 1; i < 5; i++) { advance(RESEND_COOLDOWN_MS); await service.resend(id); }
  advance(RESEND_COOLDOWN_MS);
  await assert.rejects(service.resend(id), (error: unknown) => error instanceof VerificationRateLimitError && error.retryAfterSeconds === 3300);
  assert.equal(messages.length, 5);
  advance(VERIFICATION_TTL_MS);
  await service.resend(id);
  assert.equal(doc.verificationSendCount, 1);
});

test("parallel resends reserve only one challenge", async () => {
  const { service, doc, messages } = fixture();
  const results = await Promise.allSettled([service.resend(doc._id.toHexString()), service.resend(doc._id.toHexString())]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(messages.length, 1);
});

test("parallel confirmation has exactly one winner", async () => {
  const { service, doc, messages } = fixture();
  await service.resend(doc._id.toHexString());
  const results = await Promise.allSettled([service.confirm(messages[0].token), service.confirm(messages[0].token)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
});

test("missing provider fails explicitly and leaves no usable token", async () => {
  const { service, doc } = fixture(unavailableVerificationSender);
  await assert.rejects(service.resend(doc._id.toHexString()), EmailDeliveryUnavailableError);
  assert.equal(doc.emailVerifiedAt, null);
  assert.equal(doc.verificationTokenHash, undefined);
  assert.equal(doc.verificationExpiresAt, undefined);
  await assert.rejects(service.resend(doc._id.toHexString()), VerificationRateLimitError);
});

test("failed sends cannot later confirm a captured token", async () => {
  let captured = "";
  const { service, doc } = fixture(async msg => { captured = msg.token; throw new Error("provider rejected"); });
  await assert.rejects(service.resend(doc._id.toHexString()), EmailDeliveryUnavailableError);
  await assert.rejects(service.confirm(captured), InvalidVerificationError);
  assert.equal(doc.verificationSendCount, 1);
});
