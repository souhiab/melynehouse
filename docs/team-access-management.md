# Local team management

Branch: `feature/team-access-management`. Local only; no Google Sheets changes.

## Access

The existing owner accounts keep super-admin access. Open `/owner/team` or **الفريق** in the sidebar.
Create an individual account for each employee using a name, email, role and password of 12–128 characters. Passwords are scrypt hashes, never returned by the API. Existing staff passwords cannot be displayed; the super admin can replace them.

| Profile | Access |
|---|---|
| Super admin | All existing owner features, staff administration and activity log |
| Confirmation | Read orders, create manual orders through the existing safe service; confirm, mark no response or cancel where existing transitions allow |
| Follow-up | Read orders, create manual orders through the same service; prepare, ship, deliver, mark no response or cancel where existing transitions allow |
| Products/marketing | Products, categories, images, inventory editor, ordering and banners; no customer orders, team management or order analytics |

Permissions apply to all matching API requests, not just navigation. Unknown roles and unmatched endpoints are denied. Staff cannot promote themselves or manage another account. Super-admin accounts cannot be disabled or altered through the staff editor. Existing status-transition/inventory rules still apply.

**إزالة الوصول** is recoverable deactivation, not a hard delete. Staff role/password/access changes revoke existing sessions immediately. Re-enable an account through Edit. There is no password email delivery or password-recovery service in this phase.

## Tracking

Confirmation employees use a single-order workspace at `/owner/orders`: oldest-first queue, status/search/assigned-to-me filters, real summary counts, historical item details and separately labeled current stock/SKU. Previous/Next is explicit. Saving holds the current order until Next; if the order left the selected status filter, the next fetch reuses its offset so the following order is not skipped.

The combined confirmation selector includes the requested French/Darija contact outcomes. Voicemail, WhatsApp, out-of-stock report, change/photo/address requests, postponed/call-later and customer-review flags append `confirmation_outcome` audit records. They do not change stock, customer addresses, order lifecycle, or blacklist customers. A later real status change clears the displayed outcome while preserving its audit history. Confirm/No Response/Cancel continue through the existing transaction; Shipped/Packaged remain restricted to the established roles/transitions. No migration was needed. Seven isolated team/order/lifecycle tests and `npm run check` passed; browser visual verification remains blocked by the documented runtime issue.

Expandable **إحصائيات الدخول والخروج** shows login/logout event counts over 30 days, per-member latest recorded login/logout timestamps (all available history), valid-session counts and the latest 200 login/logout events in that period. Filter by employee and use Refresh to reload. Times are explicitly formatted in Africa/Casablanca. Only super admin can access `/api/admin/team/analytics`. The endpoint returns no session identifiers or token hashes. It reuses the existing audit log and sessions; no migration is required. A valid session is not proof of current presence, and browser closure/expiry is not a recorded logout. No attendance/work-duration calculation is inferred.

The Team page shows last login and the latest 200 recorded events, filterable by employee. It reuses `admin_audit_log`, including product edits, uploads, order status changes and staff changes. It does not track keystrokes, page-view analytics or external WhatsApp message delivery. It excludes audit detail payloads from the activity API so customer details and credentials are not exposed there. Disabled users retain attribution.

## Database and validation

Migration `011_team_roles.sql` adds a constrained role column and case-insensitive email uniqueness. Existing accounts default to super admin; staff creation accepts only the three staff roles. No catalog/order schema changes.

- Backup completed with the existing backup script after adding PostgreSQL 17's bin directory to the process PATH. Backup is under ignored `var/backups/`.
- `npm run db:migrate` encountered a pre-existing `orders_source_check` failure in migration 007 when replaying historical migrations. No orders were rewritten to resolve it. Applied only migration 011 directly with the existing configured PostgreSQL connection after verifying loopback host and `melyne_dev` database. The general migration replay problem remains separate work.
- `node --env-file=.env --test tests/team-postgres.test.mjs`: real PostgreSQL, disposable schema, verifies creation, hashing, uniqueness, authentication/CSRF, role enforcement, password replacement, session revocation, disabled login, reactivation and audit retention. Checks public catalog/order counts before and after isolated tests.
- `npm run check`: catalog validation, existing admin and frontend tests, Sites tests and build passed. Admin test helpers use pg-mem; those results are distinct from the real PostgreSQL team suite.
- Browser visual verification was blocked: the computer-use runtime requires Node >=22.22.0, while the resolved runtime is 22.18.0. No runtime update was made. Do not interpret API/build tests as visual QA. The restarted API health endpoint reports PostgreSQL OK and the local `/owner/team` route responds with HTTP 200.

No real staff accounts or example passwords were seeded. Existing owner credentials are unchanged. No deployment or push.
