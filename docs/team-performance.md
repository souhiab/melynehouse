# Team confirmation analytics

Local page: `/owner/analytics/team`, accessible via Analytics navigation and the **إحصائيات الفريق** tab. Super admin only.

## Metric

Confirmation rate = orders confirmed by their assigned employee / orders currently attributed to that employee. Each order contributes once. Zero assigned orders displays an em dash, not a fabricated percentage. The page reports confirmations by another administrator separately. Counts are all-time since assignment tracking was introduced, not a daily conversion metric.

No historical assignments are inferred from status edits or manual order creation. Unassigned orders are excluded. Reassignment before confirmation transfers the denominator to the latest owner; both the old and new employee IDs remain in the audit log. No automatic allocation is implemented.

Super admin can assign the latest 100 pending/no-response orders through the expandable assignment section. Only active confirmation employees can receive orders. Reassigning the same employee is a no-op. Confirmed orders cannot be reassigned. The order row is locked during assignment, matching the lock used during status changes to avoid races.

Migration `012_order_assignments.sql` adds a separate assignment table with restrictive foreign keys. A backup was taken before applying only migration 012 to verified local `melyne_dev` PostgreSQL (the older full-run migration issue is documented separately). No existing orders were assigned or altered by migration.

The existing order-status transaction records first confirmation time and actor on the assignment in the same transaction. Retries cannot double count; later cancellation preserves the confirmation event. Stock reservation/restoration, idempotency, sources and order snapshots are unchanged. No Sheets workflow changes.

## Validation

- Real PostgreSQL disposable-schema tests: assignment permissions, active role validation, repeated assignment, confirmation retries, actual 50% attribution, confirmation by another user, unassigned legacy orders, reassignment rejection after confirmation and retention after cancellation.
- Existing isolated order-management and retired-variant tests passed alongside the team suite (6 tests total).
- `npm run check` covers existing catalog/admin/frontend/packaging checks and production build; team PostgreSQL tests run separately with `node --env-file=.env --test tests/team-postgres.test.mjs`.
- Browser visual QA remains unverified because the computer-use runtime requires a newer Node version than the available runtime. No deployment or push.
