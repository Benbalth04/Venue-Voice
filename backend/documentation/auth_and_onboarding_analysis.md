# Auth & Onboarding Flow Analysis

**Scope:** Full user journey from Supabase signup through email verification, backend bootstrapping, onboarding, dashboard guard enforcement, and Stripe subscription paywall.

**Stack:**
- Auth provider: Supabase (email/password, JWT issuing)
- Backend auth: FastAPI + `python-jose` JWT verification against Supabase JWKS
- Frontend auth: React context (`AuthContext`) + client-side guard components
- Subscription: Stripe Checkout + webhooks

---

## High-Level Journey

```
/signup
  │
  ├─ Email confirmations OFF ──────────────────────────────────────────┐
  │                                                                    │
  └─ Email confirmations ON                                            │
       │                                                               │
       ▼                                                               │
  /verify-email  ←── user clicks resend                               │
       │                                                               │
       │  (user clicks link in inbox)                                  │
       ▼                                                               │
  /auth/callback                                                       │
       │  parse hash → confirmEmail() → fetchUser()                   │
       │                                                               │
       ▼                                                               ▼
  /onboarding  [AuthGuard → EmailVerifiedGuard → OnboardingIncompleteGuard]
       │  POST /setup-account → Company + Location created
       │  refreshUser() → router.push("/dashboard")
       │
       ▼
  /dashboard  [AuthGuard → EmailVerifiedGuard → OnboardingGuard → SubscriptionGuard]
       │
       ├─ Subscription active ──→ Dashboard content ✓
       │
       └─ Not active
              │
              ▼
         /subscribe  [NO GUARDS]
              │  POST /billing/checkout → Stripe Checkout URL
              │
              ▼
         Stripe hosted checkout
              │
              ├─ Success → /billing/success → refreshUser() → /onboarding → /dashboard
              └─ Cancel  → /billing/cancel  → /subscribe
```

---

## Step-by-Step Analysis

### Step 1 — Signup
**File:** `frontend/app/signup/page.tsx`

```
supabase.auth.signUp({
  email, password,
  options: {
    emailRedirectTo: "http://localhost:3000/auth/callback",  // ← line 50
    data: { first_name, last_name }
  }
})
```

After the call:
1. If a session is immediately returned (Supabase email confirmations **OFF**): `router.push("/dashboard")`. The dashboard guard chain then handles any remaining checks.
2. If no session (confirmations **ON**): `router.push("/verify-email?email=...")`.

**Note:** The `first_name` and `last_name` metadata set here is read by the backend in `_ensure_application_user` when the user first hits any authenticated endpoint.

---

### Step 2 — Verify Email Page
**File:** `frontend/app/verify-email/page.tsx`

- On mount, checks `user.email_verified` via `AuthContext`. If already `true`, immediately redirects to `/onboarding` or `/dashboard` based on `onboarding_complete` (line 24–28).
- Displays email address from either the authenticated user object or the `?email=` query param.
- "Resend" button calls `supabase.auth.resend({ type: "signup", email })`.
- This is a passive waiting screen — no polling. The user must click the link in their inbox.

---

### Step 3 — Auth Callback
**File:** `frontend/app/auth/callback/page.tsx`

This page handles the Supabase email verification redirect. Supabase appends tokens and error information to the URL **hash** (not query string).

**Flow:**
1. Parse `window.location.hash` for `error` and `error_description`.
2. If `error` present:
   - `error=access_denied` with "expired" or "invalid" in description → shows "This verification link has already been used or has expired." (lines 28–31)
   - Otherwise → shows the raw `error_description`
   - **Stops here — does not redirect.** Shows a card with links to `/login` and `/signup`.
3. Supabase SDK auto-processes the `access_token` from the hash via `detectSessionInUrl`. Wait for `supabase.auth.getSession()`.
4. If no session after 500ms retry → show "Could not establish a session. The link may have expired."
5. Call `POST /user/confirm-email` (sets `email_verified = true` in application DB).
6. Call `fetchUser()` to get the latest user profile.
7. Redirect: `onboarding_complete ? "/dashboard" : "/onboarding"` (line 63).

---

### Step 4 — Backend User Bootstrap
**File:** `backend/app/auth/jwt.py` — `_ensure_application_user()` (line 91)

This function is called on **every authenticated backend request** via the `get_current_user` FastAPI dependency. It is the single source of truth for creating and syncing application users.

**Logic:**
1. Extract `sub` (Supabase UUID), `email`, `user_metadata` (first/last name), and `email_confirmed_at` from the decoded JWT payload.
2. Look up `User` by `id = sub`. If not found, try by `email` as a fallback (handles Supabase sub changes).
3. **If user exists:** If `email_confirmed_at` is set in the JWT but `email_verified` is `False` in the DB → set `email_verified = True` and commit. This is the automatic sync path.
4. **If user does not exist:** Create a new `User` row with `onboarding_complete=False` and `email_verified` derived from `email_confirmed_at` presence.

This means user creation in the application database is **lazy** — it happens on the first authenticated API call, not at signup time.

---

### Step 5 — `POST /user/confirm-email`
**File:** `backend/app/routes/users.py` (line 45)

```python
@router.post("/user/confirm-email")
def confirm_email(user: UserORM = Depends(get_current_user), db = Depends(get_db_connection)):
    if not user.email_verified:
        user.email_verified = True
        db.commit()
    return {"ok": True}
```

Called explicitly from `/auth/callback`. Sets `email_verified = True` if not already set. This call is **functionally redundant** because `_ensure_application_user` (which runs as part of `get_current_user`) already syncs `email_verified` from the JWT's `email_confirmed_at` field. The immediately following `fetchUser()` call would achieve the same outcome without the explicit endpoint.

---

### Step 6 — Onboarding
**File:** `frontend/app/onboarding/page.tsx`

**Guard chain on this page:**
```
AuthGuard → EmailVerifiedGuard → OnboardingIncompleteGuard → OnboardingPageContent
```

`OnboardingIncompleteGuard` is the inverse of `OnboardingGuard` — it redirects to `/dashboard` if `onboarding_complete === true`, preventing already-onboarded users from re-running setup.

**Onboarding form submits `POST /setup-account`** (`backend/app/routes/users.py` line 58):
- Creates a `Company` row (UNIQUE constraint on `owner_user_id` prevents duplicates on retry).
- Creates the first `Location` row under that company.
- Sets `user.onboarding_complete = True`.
- Idempotent: if a `Company` already exists for the user, just marks `onboarding_complete = True` and returns.

After success: `refreshUser()` updates `AuthContext`, then `router.push("/dashboard")`.

---

### Step 7 — Dashboard Guard Chain
**File:** `frontend/app/dashboard/layout.tsx`

```tsx
<AuthGuard>                    // requires: session exists
  <EmailVerifiedGuard>         // requires: user.email_verified === true
    <OnboardingGuard>          // requires: user.onboarding_complete === true
      <SubscriptionGuard>      // requires: subscription.is_active === true
        <SettingsSchemaProvider>
          <DashboardLayout>{children}</DashboardLayout>
        </SettingsSchemaProvider>
      </SubscriptionGuard>
    </OnboardingGuard>
  </EmailVerifiedGuard>
</AuthGuard>
```

All guards are **client-side React components** — there is no Next.js `middleware.ts`. Each guard reads from `AuthContext` and triggers `router.replace()` on a `useEffect` when conditions are not met. All dashboard sub-routes (`/dashboard/surveys`, `/dashboard/analytics`, etc.) inherit this chain.

**Guard redirect table:**

| Guard | Condition to pass | Redirects to |
|---|---|---|
| `AuthGuard` | `session !== null` | `/login` |
| `EmailVerifiedGuard` | `user.email_verified === true` | `/verify-email` |
| `OnboardingGuard` | `user.onboarding_complete === true` | `/onboarding` |
| `SubscriptionGuard` | `subscription.is_active === true` | `/subscribe` |

---

### Step 8 — SubscriptionGuard
**File:** `frontend/components/auth/SubscriptionGuard.tsx`

On mount, calls `GET /api/v1/billing/subscription` using the session token. The response includes `is_active` (computed by `is_subscription_active()` in the backend service). If `is_active === false` OR if the fetch throws any error, redirects to `/subscribe`. Maintains its own `checking` state separate from `AuthContext.loading` to show a loading spinner while the async fetch completes.

**Backend `is_subscription_active()` logic** (`backend/app/services/stripe_service.py`):
- `active` → always grants access
- `trialing` → grants access if `trial_end` is in the future
- `past_due` → grants access for 3 days beyond `current_period_end` (grace period)
- All other statuses (`canceled`, `incomplete`, etc.) → blocked

---

### Step 9 — Subscribe Page
**File:** `frontend/app/subscribe/page.tsx`

Fetches subscription status on mount to determine which UI to show:
- No subscription / `none` → "Start your free trial" CTA
- `past_due` or `canceled` → "Reactivate" + "Manage billing" buttons

On CTA click: `POST /billing/checkout` → backend creates a Stripe Checkout session (with `trial_period_days` applied for first-time users) → `window.location.href = checkout_url`.

**This page has no route guards.**

---

### Step 10 — Billing Success / Cancel
**Files:** `frontend/app/billing/success/page.tsx`, `frontend/app/billing/cancel/page.tsx`

**Success:** Calls `refreshUser()` (re-fetches user profile from backend), then `router.replace("/onboarding")`. Since the user already completed onboarding, `OnboardingIncompleteGuard` immediately redirects them to `/dashboard`. On the second visit to dashboard, `SubscriptionGuard` will now see `is_active = true` (Stripe webhook should have already updated the DB).

**Cancel:** `router.replace("/subscribe")` — returns user to the subscription page.

**Neither page has route guards.**

---

## Route Guard Matrix

| Route | AuthGuard | EmailVerifiedGuard | OnboardingGuard | SubscriptionGuard | OnboardingIncompleteGuard |
|---|:---:|:---:|:---:|:---:|:---:|
| `/` (landing) | — | — | — | — | — |
| `/signup` | — | — | — | — | — |
| `/login` | — | — | — | — | — |
| `/verify-email` | — | — | — | — | — |
| `/auth/callback` | — | — | — | — | — |
| `/onboarding` | ✓ | ✓ | — | — | ✓ (inverse) |
| `/subscribe` | — | — | — | — | — |
| `/billing/success` | — | — | — | — | — |
| `/billing/cancel` | — | — | — | — | — |
| `/dashboard/*` (all) | ✓ | ✓ | ✓ | ✓ | — |

---

## Gaps and Issues

### 🔴 Critical

#### 1. Hardcoded `emailRedirectTo` — will break in production
**File:** `frontend/app/signup/page.tsx:50`

```ts
emailRedirectTo: "http://localhost:3000/auth/callback"
```

This URL is hardcoded. In any non-localhost environment (staging, production), Supabase will send confirmation emails with this localhost link, which users cannot click. Should use `process.env.NEXT_PUBLIC_APP_ORIGIN` or equivalent:

```ts
emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_ORIGIN}/auth/callback`
```

Additionally, the target URL must be added to Supabase's **Allowed Redirect URLs** list in the project dashboard.

---

#### 2. No password reset / forgot-password flow
**File:** `frontend/app/auth/callback/page.tsx`

Supabase sends password reset emails with `type=recovery` in the URL hash. The callback page does not inspect the `type` parameter — it assumes every link is a signup confirmation and attempts to call `POST /user/confirm-email`. For a recovery link:
- The hash contains an `access_token` for a session scoped to the password reset
- The callback will call `confirmEmail()` (harmless but wrong intent) and then redirect the user to `/onboarding` or `/dashboard` without ever giving them a UI to set a new password

There is no `/forgot-password` page, no `/reset-password` page, and no handling for `type=recovery`. Users have no way to recover a forgotten password.

---

#### 3. `STRIPE_WEBHOOK_SECRET` is empty in `.env`
**File:** `.env` — `STRIPE_WEBHOOK_SECRET=`

**File:** `backend/app/routes/stripe_webhook.py:62–65`

```python
if not _WEBHOOK_SECRET:
    logger.error("STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook")
    raise HTTPException(status_code=400, detail="Webhook secret not configured")
```

With an empty secret, every Stripe webhook event will be rejected with a 400 error. Subscription status will never update via webhooks. The Stripe CLI listener output provides the `whsec_...` value to set here.

---

#### 4. `/subscribe` page has no auth guards
**File:** `frontend/app/subscribe/page.tsx`

Any unauthenticated user can visit `/subscribe`. The page calls `useAuth()` but does not apply `AuthGuard`, `EmailVerifiedGuard`, or `OnboardingGuard`. When `handleSubscribe()` is called without a session:

```ts
async function handleSubscribe() {
  if (!session?.access_token) return  // silently returns — no error, no redirect
  ...
}
```

The button does nothing. An unverified or non-onboarded user who somehow reaches `/subscribe` would see the trial CTA, click it, and have nothing happen. Should wrap the page in `AuthGuard → EmailVerifiedGuard → OnboardingGuard`.

---

### 🟠 High

#### 5. `/subscribe` doesn't redirect active subscribers to `/dashboard`
**File:** `frontend/app/subscribe/page.tsx:14–19`

The page fetches subscription status on mount, but only uses it to choose between "Start trial" and "Reactivate" UI states. It does not redirect to `/dashboard` if `status === "active"` or `status === "trialing"`. An active subscriber who navigates or is bookmarked to `/subscribe` will see the trial CTA — clicking it would create another Stripe Checkout session unnecessarily.

---

#### 6. `/billing/success` and `/billing/cancel` have no auth guards
**Files:** `frontend/app/billing/success/page.tsx`, `frontend/app/billing/cancel/page.tsx`

Both pages are fully public. `/billing/success` calls `refreshUser()` — harmless for an anonymous visitor (returns null) but represents an unnecessary API call. More importantly, there is nothing preventing a crafted link from being used to trigger state resets.

---

#### 7. Already-logged-in user gets error page on re-used confirmation link
**File:** `frontend/app/auth/callback/page.tsx:26–35`

When a user clicks an already-used confirmation link, Supabase returns `error=access_denied`. The callback page shows an error card and stops — it does **not** check whether the user already has an active session. A logged-in user with a verified email who clicks an old link (e.g., from email history) will see "Verification failed" instead of being silently redirected to the dashboard.

**Fix:** Before rendering the error state, check if a session already exists and `user.email_verified === true`, then redirect to dashboard.

---

#### 8. Login page redirects unverified users via dashboard (indirect)
**File:** `frontend/app/login/LoginPageClient.tsx:50–53`

After login, the redirect decision is:
```ts
router.push(me.onboarding_complete ? next : "/onboarding")
```

`email_verified` is not checked. An unverified user logs in and is sent to `/dashboard` (if onboarding complete) or `/onboarding`. In both cases a guard eventually catches them and redirects to `/verify-email`. This is not broken, but it introduces an extra redirect hop and could briefly flash loading states. The login page could short-circuit by checking `email_verified` directly.

---

### 🟡 Medium

#### 9. No email change flow
**File:** `frontend/app/auth/callback/page.tsx`

Supabase supports changing account email, which sends a confirmation link with `type=email_change` in the hash. The callback does not handle this type and would process it as a signup confirmation. No UI exists to initiate an email change, and no route exists to confirm one.

---

#### 10. No UI indication that the free trial has already been used
**File:** `backend/app/services/stripe_service.py:143–148`

The backend sets `trial_from_plan=False` on re-subscription to prevent a second trial at the Stripe level. However, the `/subscribe` frontend page always shows "Start your free trial" as the CTA for users with `status=none`. A user who previously cancelled and is re-subscribing will see the trial CTA, proceed through checkout, and only discover at the Stripe checkout page (or after payment) that no trial applies.

The `GET /billing/subscription` endpoint could return an `eligible_for_trial` flag, and the frontend could adjust its messaging accordingly.

---

#### 11. `SubscriptionGuard` redirects to `/subscribe` on transient network errors
**File:** `frontend/components/auth/SubscriptionGuard.tsx:28–33`

```ts
.catch(() => {
  router.replace("/subscribe")
})
```

Any network failure — a brief backend restart, a slow connection, a Docker container coming up — redirects the user to `/subscribe`. Users with active subscriptions can be incorrectly bounced to the subscribe page during backend downtime. A retry with exponential backoff, or at minimum an error state that lets the user retry manually, would be more appropriate.

---

#### 12. Misleading error message in callback when `confirmEmail()` fails
**File:** `frontend/app/auth/callback/page.tsx:64–66`

```ts
} catch {
  setErrorMessage("Account verified, but we could not load your profile. Please log in.")
  setState("error")
}
```

When `confirmEmail()` or `fetchUser()` throws, the message claims "Account verified" — but the user is shown an error state with no auto-redirect. The Supabase session is valid (the link worked), so the user genuinely is verified, but the UX leaves them stranded on an error page. A better approach: catch the error but still redirect to `/login` with a message, since the user's Supabase session is intact.

---

### ⚪ Low / Code Quality

#### 13. `POST /user/confirm-email` is functionally redundant
**Files:** `backend/app/routes/users.py:45`, `backend/app/auth/jwt.py:109–113`

`_ensure_application_user` already syncs `email_verified` from the JWT's `email_confirmed_at` field on every authenticated request. The explicit `confirmEmail()` call from the callback is redundant — the subsequent `fetchUser()` call triggers `get_current_user`, which triggers `_ensure_application_user`, which would set `email_verified = True` anyway. The endpoint is not harmful but adds an unnecessary round trip and an endpoint that could be removed.

---

#### 14. `APP_ORIGIN` must be set correctly in production
**File:** `backend/app/services/stripe_service.py:33,156–157`

```python
_APP_ORIGIN = os.getenv("APP_ORIGIN", "http://localhost:3000")
...
success_url=f"{_APP_ORIGIN}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
cancel_url=f"{_APP_ORIGIN}/billing/cancel",
```

If `APP_ORIGIN` is not set in the production environment, Stripe will redirect users back to `localhost:3000` after checkout — a dead link. Ensure this is set in all deployment environments and matches the actual frontend URL.

---

#### 15. All route protection is client-side — no Next.js middleware
There is no `middleware.ts` at the frontend root. All route protection is implemented as client-side React components (`AuthGuard`, etc.) that redirect using `router.replace()`. This means:
- A user can briefly see a protected page before the redirect fires (flash of content)
- API routes themselves are the true enforcement layer; the guards are UX-only
- A sophisticated user could suppress JS execution and "see" page structure

For the current use case (B2B SaaS with non-adversarial users) this is acceptable. If stronger enforcement is desired, Next.js middleware with cookie-based session checks would prevent the flash.

---

#### 16. `next.config.ts` is empty
**File:** `frontend/next.config.ts`

No security headers (`X-Frame-Options`, `Content-Security-Policy`, etc.), no redirects, no rewrite rules. For production, adding at minimum `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff` is recommended.

---

## Happy Path — Brand New User

1. User visits `/signup`, enters name/email/password, submits.
2. Supabase creates auth user; sends confirmation email to `emailRedirectTo`.
3. Frontend detects no session → redirects to `/verify-email?email=user@example.com`.
4. User clicks link in inbox → browser opens `/auth/callback#access_token=...`.
5. Callback page parses hash, establishes Supabase session, calls `POST /user/confirm-email` (sets `email_verified=true` in DB), fetches user profile.
6. `onboarding_complete === false` → redirect to `/onboarding`.
7. Onboarding guards all pass (session ✓, email verified ✓, onboarding incomplete ✓).
8. User fills company/location form, submits → `POST /setup-account` creates Company + Location, sets `onboarding_complete = True`.
9. `refreshUser()` updates `AuthContext`; page navigates to `/dashboard`.
10. Dashboard guard chain: session ✓, email_verified ✓, onboarding_complete ✓, subscription check → `is_active = false` (no subscription yet) → redirect to `/subscribe`.
11. User sees "Start your free trial" CTA → clicks → `POST /billing/checkout` → Stripe Checkout URL.
12. Stripe hosted checkout page → user enters card → confirms.
13. Stripe fires `customer.subscription.created` webhook → backend syncs `status=trialing` to DB.
14. Stripe redirects browser to `/billing/success`.
15. `refreshUser()` → `router.replace("/onboarding")`.
16. `OnboardingIncompleteGuard` sees `onboarding_complete=true` → redirect to `/dashboard`.
17. `SubscriptionGuard` now fetches subscription → `is_active=true` → renders dashboard. ✓

---

## Return User — Existing Subscriber Logging Back In

1. User visits `/login`, enters credentials.
2. `supabase.auth.signInWithPassword()` → Supabase returns session.
3. `fetchUser()` called → backend `get_current_user` runs `_ensure_application_user` → returns existing user row.
4. `onboarding_complete === true` → `router.push("/dashboard")`.
5. `AuthContext` is populated with session + user via `onAuthStateChange` listener.
6. Dashboard guard chain: all pass immediately (no loading flicker after initial hydration).
7. `SubscriptionGuard` fetches subscription → `is_active=true` → dashboard renders. ✓
