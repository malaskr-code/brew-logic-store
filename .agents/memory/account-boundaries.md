---
name: Account boundaries
description: Why customer authentication must not grant catalog-owner access.
---

Use the user-requested MongoDB/password/JWT system for customer accounts while retaining the existing verified Clerk identity for private owner editing.

**Why:** Proof of email ownership in a customer account is not proof of the separately authenticated catalog-owner identity. Allowing a customer registration that merely matches the configured owner email to grant admin access would allow takeover. Keeping the existing admin authentication also avoids invalidating the owner's account.

**How to apply:** Customer login/logout must not grant or revoke Clerk admin access. Never authorize catalog editing from a customer email.

Customer email verification is intentionally disabled. New accounts sign in immediately after signup.

**Why:** The user canceled customer email verification and requested removal of its routes, emails, tokens, banners, checks, and unused Resend configuration while preserving password/JWT authentication.

**How to apply:** Do not add customer email-verification requirements or prompts unless the user explicitly requests them again. Leave Clerk's owner verification checks intact.
