import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { GetCustomerSessionResponse, SignupCustomerResponse } from "@workspace/api-zod";
import { getMongoDatabase, closeMongoDatabase } from "./mongo";

test("live MongoDB catalog migration and customer account API", {
  skip: process.env.RUN_MONGO_INTEGRATION_TESTS !== "1",
  timeout: 30000,
}, async () => {
  const email = `bl-verify-${randomUUID()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const url = "http://localhost:80/api";
  const request = (path: string, body?: unknown, cookie?: string) => fetch(url + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": "198.51.100.77", ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    const db = await getMongoDatabase();
    const productResponse = await request("/products");
    const bundleResponse = await request("/bundles");
    assert.ok(productResponse.status === 200 && bundleResponse.status === 200, "Public catalog routes must succeed");
    const products = await productResponse.json();
    const bundles = await bundleResponse.json();
    assert.ok(Array.isArray(products) && Array.isArray(bundles), "Catalog endpoints must return arrays");
    for (const kind of ["product", "bundle"] as const) {
      const target = db.collection(kind === "product" ? "products" : "bundles");
      const legacy = await db.collection("catalog").find({ kind }).toArray();
      for (const old of legacy) {
        const migrated = await target.findOne({ id: old.id });
        assert.ok(migrated, "Every legacy entry must be preserved");
        const { _id: oldId, ...oldFields } = old;
        const { _id: newId, ...newFields } = migrated;
        assert.ok(isDeepStrictEqual(oldFields, newFields), "Migration must preserve all catalog fields");
      }
    }
    assert.ok((await request("/auth/me")).status === 200, "Guests must be able to check session");
    const invalid = await request("/auth/signup", { name: "Test", email: "invalid", password: "short" });
    assert.ok(invalid.status === 400, "Signup fields must be validated");
    const response = await request("/auth/signup", { name: "Verification Customer", email: email.toUpperCase(), password });
    assert.ok(response.status === 201, "Signup must succeed with configured MongoDB and JWT secret");
    const raw = await response.text();
    assert.ok(!raw.includes(password) && !raw.includes("passwordHash") && !raw.includes('"token"'), "Credentials must never be returned in JSON");
    const session = SignupCustomerResponse.parse(JSON.parse(raw));
    assert.ok(session.user, "Signup must return a customer");
    assert.ok(session.user.email === email, "Email must be normalized to lowercase");
    const setCookie = response.headers.get("set-cookie") || "";
    assert.ok(/httponly/i.test(setCookie) && /secure/i.test(setCookie) && /samesite=lax/i.test(setCookie) && /max-age=604800/i.test(setCookie), "Cookie must have required protections and seven-day duration");
    const cookie = setCookie.split(";")[0]!;
    const payload = JSON.parse(Buffer.from(cookie.slice(cookie.indexOf("=") + 1).split(".")[1]!, "base64url").toString());
    assert.ok(payload.exp - payload.iat === 604800, "JWT must expire after seven days");
    const stored = await db.collection("users").findOne({ email });
    assert.ok(stored && typeof stored.passwordHash === "string" && /^\$2[aby]\$(1[0-9]|[2-9][0-9])\$/.test(stored.passwordHash), "Password must use bcrypt cost >=10");
    assert.ok(stored.passwordHash !== password && !("password" in stored), "Only the password hash may be stored");
    assert.ok(stored.createdAt instanceof Date && stored.name === "Verification Customer", "User fields must persist");
    assert.ok((await db.collection("users").listIndexes().toArray()).some(index => index.unique && index.key.email === 1), "Email must have a unique index");
    const me = GetCustomerSessionResponse.parse(await (await request("/auth/me", undefined, cookie)).json());
    assert.ok(me.user?.id === session.user.id && !("passwordHash" in me.user), "Cookie must restore the safe customer profile");
    assert.ok((await request("/admin/catalog", undefined, cookie)).status === 401, "Customer login must not grant owner access");
    assert.ok((await request("/admin/catalog", {}, cookie)).status === 401, "Customer login must not allow catalog changes");
    const duplicate = await request("/auth/signup", { name: "Test", email: email.toUpperCase(), password });
    const duplicateError = await duplicate.json() as { code?: string };
    assert.ok(duplicate.status === 409 && duplicateError.code === "email_in_use", "Duplicate email must have a clear error");
    for (const credentials of [{ email, password: "wrong-password" }, { email: `missing-${email}`, password }]) {
      const failed = await request("/auth/login", credentials);
      const loginError = await failed.json() as { error?: string };
      assert.ok(failed.status === 401 && loginError.error === "Email or password is incorrect", "Login errors must not reveal which credential failed");
    }
    const login = await request("/auth/login", { email: email.toUpperCase(), password });
    assert.ok(login.status === 200, "Correct credentials must log in");
    const loggedOut = await request("/auth/logout", {}, cookie);
    assert.ok(loggedOut.status === 204 && /expires=Thu, 01 Jan 1970/i.test(loggedOut.headers.get("set-cookie") || ""), "Logout must clear the protected cookie");
    assert.ok(GetCustomerSessionResponse.parse(await (await request("/auth/me")).json()).user === null, "Guest session must remain available");
    const crossSite = await fetch(url + "/auth/logout", { method: "POST", headers: { Origin: "https://unrelated.example", Cookie: cookie } });
    assert.ok(crossSite.status === 403, "Cross-site account changes must be refused");
    const malformed = await fetch(url + "/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: `{"password":"${password}" invalid}` });
    assert.ok(malformed.status === 400 && !(await malformed.text()).includes(password), "Parser errors must never echo passwords");
  } catch {
    // Avoid test failure reports containing cookies, passwords, hashes, or connection details.
    throw new Error("Customer/catalog integration verification failed. Inspect sanitized API statuses.");
  } finally {
    try { await (await getMongoDatabase()).collection("users").deleteOne({ email }); }
    finally { await closeMongoDatabase(); }
  }
});
