import { createHash, randomBytes } from "node:crypto";
import { ObjectId, type Collection } from "mongodb";
import type { CustomerDocument } from "./customer-auth";

export const VERIFICATION_TTL_MS = 60 * 60 * 1000;
export const RESEND_COOLDOWN_MS = 60 * 1000;
const RESEND_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;

export class InvalidVerificationError extends Error {}
export class VerificationRateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) { super("Verification resend limit reached"); }
}
export class EmailDeliveryUnavailableError extends Error {}

export type VerificationMessage = {
  email: string;
  // The future connected provider must use its configured, trusted storefront
  // origin, never a request Host/Origin header, to build /verify-email#token=...
  token: string;
  expiresAt: Date;
};
export type VerificationSender = (message: VerificationMessage) => Promise<void>;

// The user explicitly declined connecting an email provider. Fail closed:
// no console mailbox, public token response, fabricated delivery, or bypass.
export const unavailableVerificationSender: VerificationSender = async () => {
  throw new EmailDeliveryUnavailableError("No transactional email provider connected");
};

export const hashVerificationToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function createCustomerVerification(
  getUsers: () => Promise<Collection<CustomerDocument>>,
  send: VerificationSender,
  now: () => number = Date.now,
) {
  return {
    async resend(id: string) {
      const users = await getUsers();
      const _id = new ObjectId(id);
      const time = now();
      const current = await users.findOne({ _id });
      if (!current) throw new InvalidVerificationError();
      if (current.emailVerifiedAt) return { status: "already_verified" as const, retryAfterSeconds: 0 };
      const inWindow = (current.verificationWindowStartedAt?.getTime() ?? 0) > time - RESEND_WINDOW_MS;
      const count = inWindow ? current.verificationSendCount ?? 0 : 0;
      const retryAt = Math.max(
        (current.verificationLastSentAt?.getTime() ?? 0) + RESEND_COOLDOWN_MS,
        count >= MAX_SENDS_PER_WINDOW ? current.verificationWindowStartedAt!.getTime() + RESEND_WINDOW_MS : 0,
      );
      if (retryAt > time) throw new VerificationRateLimitError(Math.ceil((retryAt - time) / 1000));

      const token = randomBytes(32).toString("hex");
      const tokenHash = hashVerificationToken(token);
      const expiresAt = new Date(time + VERIFICATION_TTL_MS);
      // Compare-and-swap reserves the send across workers, not just this process.
      // Persist a hash only; replace the old challenge on each resend.
      const reserved = await users.updateOne({
        _id, emailVerifiedAt: null,
        verificationLastSentAt: current.verificationLastSentAt ?? { $exists: false },
        verificationSendCount: current.verificationSendCount ?? { $exists: false },
      }, {
        $set: {
          verificationTokenHash: tokenHash, verificationExpiresAt: expiresAt,
          verificationLastSentAt: new Date(time),
          verificationWindowStartedAt: inWindow ? current.verificationWindowStartedAt! : new Date(time),
          verificationSendCount: count + 1,
        },
      });
      if (!reserved.modifiedCount) throw new VerificationRateLimitError(60);
      try {
        await send({ email: current.email, token, expiresAt });
      } catch {
        // A failed delivery must not leave a usable challenge. Failed attempts
        // still count toward the quota to avoid hammering an unavailable provider.
        await users.updateOne({ _id, verificationTokenHash: tokenHash }, {
          $unset: { verificationTokenHash: "", verificationExpiresAt: "" },
        });
        throw new EmailDeliveryUnavailableError("Verification email delivery unavailable");
      }
      return { status: "sent" as const, retryAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
    },
    async confirm(token: string) {
      if (!/^[a-f0-9]{64}$/.test(token)) throw new InvalidVerificationError();
      const result = await (await getUsers()).updateOne({
        verificationTokenHash: hashVerificationToken(token),
        verificationExpiresAt: { $gt: new Date(now()) },
        emailVerifiedAt: null,
      }, {
        $set: { emailVerifiedAt: new Date(now()) },
        $unset: { verificationTokenHash: "", verificationExpiresAt: "" },
      });
      if (!result.modifiedCount) throw new InvalidVerificationError();
      // Never issue a session or grant privileges based on this bearer token.
      return { status: "verified" as const };
    },
  };
}
