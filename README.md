# CASH TOP — Turso R74

Static web build using Turso/libSQL with a local-first, cache-first sync strategy.

Key points:
- MongoDB, Vercel, Firebase backend/push removed.
- All application pages are pre-cached and served cache-first even while online.
- Turso sync uses an exact primary-key row per dataset and a single compact meta row with per-dataset change stamps.
- Pending local edits upload on page entry; cross-device checks read meta first and fetch only changed datasets relevant to the current page.
- Manual sync is page-scoped; full-company pulls are reserved for explicit maintenance code paths.
- Notifications section and manager smart alerts are enabled, except the "new sales invoice" manager alert.
- Custom plan supports daily limits (invoices/customers/expenses/suppliers) and fixed limits (employees/warehouses/branches/products).
- Only the company key is persistently remembered after login; account session stays tab-scoped with a desktop-safe transient fallback.
- Backups from another company key can be imported while preserving the current company's identity, plan and manager configuration.

Security note: this is a static browser application. The Turso read/write token in `turso-config.js` is visible to anyone who can read the deployed JavaScript. Rotate the token after testing and do not treat it as a secret in a public deployment.


## R106 — lossless records and offline sync gate
See `R106-CHANGES.txt` for the record-safe merge, archive recovery, login sync progress screen, and mobile-data reconnect recovery.
