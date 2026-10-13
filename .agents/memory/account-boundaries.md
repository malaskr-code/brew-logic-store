---
name: Account boundaries
description: Why customer authentication must not grant catalog-owner access.
---

Use the user-requested MongoDB/password/JWT system for customer accounts while retaining the existing verified Clerk identity for private owner editing.

**Why:** Customer signup does not verify email ownership. Allowing a customer registration that merely matches the configured owner email to grant admin access would allow takeover. Keeping the existing admin authentication also avoids invalidating the owner's account.

**How to apply:** Customer login/logout must not grant or revoke Clerk admin access. Never authorize catalog editing solely from an unverified customer email.
