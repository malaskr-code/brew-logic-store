import assert from "node:assert/strict";
import { test } from "node:test";
import { SignupCustomerBody, LoginCustomerBody } from "@workspace/api-zod";
import { AuthAttemptLimiter, customerCookieOptions, SESSION_DURATION } from "./customer-auth";

test("customer input rejects invalid email, missing name, and short passwords", () => {
  const valid = { name: "Customer", email: "customer@example.com", password: "long-enough-test" };
  assert.ok(SignupCustomerBody.safeParse(valid).success);
  assert.equal(SignupCustomerBody.safeParse({ ...valid, email: "invalid" }).success, false);
  assert.equal(SignupCustomerBody.safeParse({ ...valid, name: "" }).success, false);
  assert.equal(SignupCustomerBody.safeParse({ ...valid, password: "1234567" }).success, false);
  assert.equal(LoginCustomerBody.safeParse({ email: valid.email, password: "x".repeat(73) }).success, false);
});

test("customer cookie is server-only, secure, same-site, with a seven-day lifetime", () => {
  assert.deepEqual(customerCookieOptions, { httpOnly: true, secure: true, sameSite: "lax", path: "/" });
  assert.equal(SESSION_DURATION, 604800000);
});

test("account attempt limits isolate visitors and reset at expiry", () => {
  const limiter = new AuthAttemptLimiter();
  for (let i = 0; i < 10; i++) assert.ok(limiter.allow("visitor-one", 10, 60000, 1000));
  assert.equal(limiter.allow("visitor-one", 10, 60000, 60999), false);
  assert.ok(limiter.allow("visitor-two", 10, 60000, 2000));
  assert.ok(limiter.allow("visitor-one", 10, 60000, 61000));
});
