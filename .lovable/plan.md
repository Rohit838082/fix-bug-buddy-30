
# Admin panel + paid teacher subscriptions

You picked: **Teachers pay**, plans **Free + Pro + Business**, payments via **Stripe** (Lovable-managed, no Stripe account needed to test), and an admin panel covering **users, subscriptions, classes/attendance, teacher requests, and analytics**.

> Note: the eligibility check actually recommended Paddle for this app (it's a clean SaaS use case and Paddle handles tax/compliance globally), but you asked for Stripe and I'll respect that. Easy to switch later.

---

## Plan overview

```text
┌─────────────────────────────────────────────────────────────┐
│  /admin  (admin role only — gated layout)                   │
│  ├─ /admin                  Overview + analytics             │
│  ├─ /admin/users            Search / role change / suspend   │
│  ├─ /admin/teacher-requests Approve or reject in-app         │
│  ├─ /admin/subscriptions    Subscribers, status, revenue     │
│  ├─ /admin/classes          All classes + attendance trends  │
│  └─ /admin/plans            Read-only plan catalog           │
│                                                              │
│  /teacher/billing           Teacher's own upgrade page       │
└─────────────────────────────────────────────────────────────┘
```

### Free / Pro / Business limits (default seed — easy to edit later)

| Feature                       | Free | Pro       | Business  |
| ----------------------------- | ---- | --------- | --------- |
| Active classes                | 2    | 20        | Unlimited |
| Students per class            | 30   | 200       | Unlimited |
| Attendance locations / class  | 1    | 5         | Unlimited |
| Reports export (CSV)          | No   | Yes       | Yes       |
| Priority support              | No   | No        | Yes       |
| Price                         | $0   | $9 /mo    | $29 /mo   |

These limits are enforced both in the UI and on the database (so they can't be bypassed by hitting the API directly).

---

## What gets built

### 1. Admin role bootstrap
- New `admin` value on the existing `app_role` enum.
- Grant `admin` to the existing approver email (`pvishvajeet52@gmail.com`) so you can log in and see the panel immediately. You can grant more admins from the panel itself afterwards.

### 2. Subscription data model
New tables (all with RLS, GRANTs, and admin-only mutation):
- `subscription_plans` — Free, Pro, Business + their limits and Stripe price IDs. Seeded.
- `subscriptions` — one row per teacher: current plan, status (`active`, `trialing`, `past_due`, `canceled`), `current_period_end`, `stripe_customer_id`, `stripe_subscription_id`.
- `user_status` — per-user `active` / `suspended` flag so an admin can disable a user without deleting them.

Helpers:
- `current_plan(uuid)` — returns the teacher's effective plan row (defaults to Free).
- DB triggers reject new classes / new students / new class locations when the teacher is over their plan limit, with clear error messages the UI can show as toasts.
- A login-time check in `_authenticated` redirects suspended users to a "Your account is suspended" page.

### 3. Stripe payments (Lovable-managed)
- Enable Lovable's built-in Stripe payments (no Stripe account / API key needed for test mode — live needs an account claim later).
- Create three Stripe products matching the plans above.
- New page `/teacher/billing`:
  - Shows current plan + renewal date.
  - "Upgrade to Pro / Business" buttons start a Stripe Checkout session.
  - "Manage / cancel" opens the Stripe customer portal.
- Public webhook route `/api/public/webhooks/stripe` (signature-verified) keeps the `subscriptions` table in sync on `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted`.
- Free plan is automatic — no checkout required.

### 4. Admin panel UI
A new pathless layout `src/routes/_authenticated/_admin/route.tsx` gates everything below it with `has_role(auth.uid(),'admin')`, plus a left sidebar.

**`/admin` — Overview**
KPI cards (total users, active teachers, paid subscribers, MRR, classes today, attendance today) + two charts: signups over last 30 days, attendance over last 30 days.

**`/admin/users`**
Searchable table with name, email, role, plan, status, joined date. Row actions: change role (student / teacher / admin), suspend / unsuspend, delete (calls Supabase Auth Admin via a privileged server fn — admin-gated).

**`/admin/teacher-requests`**
Replaces the email approval flow with an in-app inbox: pending / approved / rejected tabs, one-click Approve / Reject (uses the existing `app_admin_decide_teacher_request` RPC). Email approval keeps working as a fallback.

**`/admin/subscriptions`**
Table of all paying teachers: plan, status, current period end, lifetime value. Filters by plan / status. Row action opens the Stripe customer portal scoped to that customer.

**`/admin/classes`**
All classes across all teachers. Per-row drill-down to a read-only view of students + recent attendance, with date-range filter and CSV export.

**`/admin/plans`**
Read-only view of the plan catalog and current limits so an admin can verify what each tier includes.

### 5. Teacher-side touches (so paying actually matters)
- Class-create form shows the current usage vs limit and disables submit when over (e.g., "2 / 2 classes on Free — upgrade to add more").
- A small "Plan: Free" pill in the teacher header linking to `/teacher/billing`.

### 6. Security
- All admin server functions use `requireSupabaseAuth` + an explicit `has_role(userId, 'admin')` check before any privileged work.
- Stripe webhook verifies the signature using `STRIPE_WEBHOOK_SECRET` before any DB write.
- Service role is only used inside verified webhook / admin server functions, never in browser code.
- RLS keeps subscription rows readable only by the owning teacher and admins.

---

## Technical notes

**Stack:** TanStack Start server functions for admin actions, server route under `/api/public/webhooks/stripe` for the webhook, Supabase RLS for data isolation, shadcn `Table` + `Card` + `Tabs` + `Recharts` for the panel UI, sidebar via the shadcn `Sidebar` primitives.

**Migrations:**
1. Add `admin` to `app_role`; grant `admin` to the existing approver email.
2. Create `subscription_plans`, `subscriptions`, `user_status` with grants + RLS + admin policies; seed three plans.
3. Add `enforce_plan_limits` triggers on `classes`, `class_students`, `class_locations`.
4. Add `current_plan(uuid)` + `is_admin()` helpers.

**Secrets:** `STRIPE_WEBHOOK_SECRET` (added during the Stripe enable flow). No other secrets needed for test mode.

**Out of scope for this iteration:** annual billing, prorations UI, coupon codes, multi-admin invites, audit log. Easy follow-ups once the core is live.

---

## Build order (single pass, ~one large turn)

1. Migration: admin role + bootstrap + subscription tables + plan-limit triggers + plans seed.
2. Enable Stripe payments (you'll fill in the email form, then I create the three products).
3. Admin layout + `/admin` overview with KPIs + charts.
4. Users, teacher-requests, subscriptions, classes, plans subpages.
5. Teacher billing page + checkout + portal + webhook route.
6. Plan-limit hints in the class-create UI.

Approve and I'll start at step 1.
