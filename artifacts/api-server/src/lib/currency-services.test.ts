import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchExchangeRates, locateVisitor, resolveVisitorIp } from "./currency-services";

test("visitor IP uses the first forwarded value, or an explicit valid test IP", () => {
  assert.equal(resolveVisitorIp(" 1.2.3.4, 5.6.7.8 ", undefined), "1.2.3.4");
  assert.equal(resolveVisitorIp(["1.2.3.4, 5.6.7.8"], undefined), "1.2.3.4");
  assert.equal(resolveVisitorIp("1.2.3.4", "8.8.8.8"), "8.8.8.8");
  assert.equal(resolveVisitorIp("2001:db8::1, 1.2.3.4", undefined), "2001:db8::1");
  assert.equal(resolveVisitorIp(undefined, undefined), null);
  assert.equal(resolveVisitorIp("", undefined), null);
  assert.equal(resolveVisitorIp("unknown, 1.2.3.4", undefined), null);
  assert.equal(resolveVisitorIp("1.2.3.4", "../credentials"), null);
});

test("location requests always append the IP and expose only countryCode and the first currency", async () => {
  const result = await locateVisitor("1.2.3.4", "https://geo.example.invalid/", async url => {
    assert.equal(url, "https://geo.example.invalid/1.2.3.4");
    return new Response(JSON.stringify({ countryCode: "BH", currencies: ["BHD", "USD"], country: "Bahrain", timezone: "Asia/Bahrain" }));
  });
  assert.deepEqual(result, { countryCode: "BH", currency: "BHD" });
});

test("missing and invalid IPs never call the provider", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return new Response("{}"); };
  await assert.rejects(locateVisitor("", "https://geo.example.invalid", fetcher), /Visitor IP required/);
  await assert.rejects(locateVisitor("not-an-ip", "https://geo.example.invalid", fetcher), /Visitor IP required/);
  assert.equal(calls, 0);
});

test("empty currencies are safe; provider failures and invalid data reject", async () => {
  assert.deepEqual(await locateVisitor("1.2.3.4", "https://geo.example.invalid",
    async () => new Response('{"countryCode":"BH","currencies":[]}')), { countryCode: "BH", currency: null });
  await assert.rejects(locateVisitor("1.2.3.4", "https://geo.example.invalid",
    async () => new Response("provider error", { status: 500 })), /Location unavailable/);
  await assert.rejects(locateVisitor("1.2.3.4", "https://geo.example.invalid",
    async () => new Response("{}")), /Invalid location response/);
});

test("rates use the KWD endpoint, including the new Gulf currencies", async () => {
  const payload = { result: "success", base_code: "KWD", rates: { KWD: 1, USD: 3.25, BHD: 1.22, QAR: 11.83, OMR: 1.25 } };
  const result = await fetchExchangeRates(async url => {
    assert.equal(url, "https://open.er-api.com/v6/latest/KWD");
    return new Response(JSON.stringify(payload));
  });
  assert.deepEqual(result, payload);
  await assert.rejects(fetchExchangeRates(async () => new Response(JSON.stringify({
    ...payload, rates: { KWD: 1, USD: 0 },
  }))), /Invalid exchange rates/);
});
