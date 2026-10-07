# Researcher access plan

## Deployment boundary

- Keep the participant API on the public Worker.
- Keep all `/admin/*` routes disabled on the public Worker by default.
- Deploy the researcher portal and its API on a separate Worker protected in full by Cloudflare Access.
- Enable `ADMIN_API_ENABLED=true` only on the Access-protected researcher Worker.
- Store the researcher allowlist in Cloudflare secrets, never in Git.

## Roles

- Cloudflare account owner: the immutable highest-privilege project owner. The current owner email is stored as the `PROJECT_OWNER_EMAIL` Cloudflare secret and is not committed to Git.
- Project owner: manages researcher access, project status, exports, and retention actions.
- Researcher: reviews submissions and accesses transformed recordings when permitted.
- Revoked researcher: cannot sign in or use an existing session after revocation takes effect.

## Access lifecycle

- The project owner can add, disable, or remove a researcher account from the project dashboard.
- The dashboard provides a `Revoke all other researchers` action that disables every researcher except the immutable Cloudflare account owner.
- The immutable owner cannot be demoted, disabled, removed, or included in a bulk revocation operation.
- Server-side authorization enforces owner protection; hiding or disabling a UI button is not sufficient.
- Removing access revokes authorization; it does not delete submissions, transformed audio, reviews, or audit logs.
- Ending a project provides a separate `Revoke all other researcher access` action with an explicit confirmation screen.
- Every access change records the acting administrator, target account, action, and timestamp.
- Cloudflare Access policies remain the enforcement boundary; the application database mirrors role and status for UI and auditing.

## Project closure

- Set the project to `closed` before revoking researchers.
- Block new participant sessions and new uploads while preserving existing data according to the approved retention policy.
- Revoke all non-owner researcher access separately from data deletion.
- Data deletion requires its own confirmed workflow and must not be implied by removing a user.
