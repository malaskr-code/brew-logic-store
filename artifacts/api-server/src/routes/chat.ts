import { Router, type IRouter } from "express";
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { SendChatMessageBody, SendChatMessageResponse } from "@workspace/api-zod";
import { askGroq, BUSY_REPLY, ChatRateLimitError, VisitorChatLimiter } from "../lib/chat-service";

const router: IRouter = Router();
const limiter = new VisitorChatLimiter();
const signingKey = process.env.SESSION_SECRET || randomBytes(32).toString("hex");
const signature = (id: string) => createHmac("sha256", signingKey).update(id).digest("base64url");

function visitorId(cookie: string | undefined) {
  const token = cookie?.split(";").map(value => value.trim()).find(value => value.startsWith("brew_chat_visitor="))?.slice("brew_chat_visitor=".length);
  if (!token) return null;
  const [id, supplied] = token.split(".");
  if (!id || !/^[a-f0-9-]{36}$/.test(id) || !supplied) return null;
  const expected = Buffer.from(signature(id));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? id : null;
}

router.post("/chat", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  let visitor = visitorId(req.headers.cookie);
  if (!visitor) {
    visitor = randomUUID();
    res.cookie("brew_chat_visitor", `${visitor}.${signature(visitor)}`, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/chat",
    });
  }
  if (!limiter.allow(visitor)) {
    res.setHeader("Retry-After", "60");
    res.status(429).json(SendChatMessageResponse.parse({ reply: BUSY_REPLY, error: "rate_limited" }));
    return;
  }
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success || parsed.data.messages.some(message => !message.content.trim())
    || parsed.data.messages.at(-1)?.role !== "user") {
    res.status(400).json(SendChatMessageResponse.parse({ reply: "Send a message of 1–500 characters with at most 6 history messages.", error: "invalid_message" }));
    return;
  }
  const key = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL;
  if (!key || !model) {
    res.status(503).json(SendChatMessageResponse.parse({ reply: "The assistant is unavailable right now. Please try again later.", error: "unavailable" }));
    return;
  }
  try {
    const reply = await askGroq(parsed.data.messages, { key, model });
    res.json(SendChatMessageResponse.parse({ reply }));
  } catch (error) {
    if (error instanceof ChatRateLimitError) {
      res.setHeader("Retry-After", "60");
      res.status(429).json(SendChatMessageResponse.parse({ reply: BUSY_REPLY, error: "rate_limited" }));
      return;
    }
    // Do not log upstream bodies, prompts, user messages, or credentials.
    req.log.warn("Chat provider request failed");
    res.status(503).json(SendChatMessageResponse.parse({ reply: "The assistant is unavailable right now. Please try again later.", error: "unavailable" }));
  }
});

export default router;
