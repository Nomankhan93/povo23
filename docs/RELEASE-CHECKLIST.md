# Current release checklist — POEM 2.18.2

## POEM 2.18.2 acceptance

- [ ] `20261008000920_ewallet_withdrawal_stabilization.sql` is applied and 2.18.1 tests are green.
- [ ] `20261008000930_withdrawal_operations_manual_settlement.sql` applies locally.
- [ ] `node scripts/test-phase218.mjs`, `test-phase2181.mjs` and `test-phase2182.mjs` pass.
- [ ] Requested/approved/processing withdrawals continue reserving exact payable allocations.
- [ ] Ordinary users cannot approve/process/settle/fail/reverse withdrawals or mutate operation history.
- [ ] Manual settlement requires a provider external reference and creates existing payable payment events exactly once.
- [ ] Large withdrawals enforce dual control at the configured threshold.
- [ ] Provider external references cannot be reused for the same provider.
- [ ] Failure releases reservation without payment; reversal posts exact paired payment-reversal events.
- [ ] Reconciliation reports allocation/payment/reversal/finance-link drift explicitly.
- [ ] Server-side minimum, maximum and daily limits are enforced.
- [ ] JazzCash/Easypaisa remain the only payout methods; no bank/IBAN path or fake live API is added.
- [ ] Full preflight/local/operations regression and `git diff --check` are green before cloud push.

## POEM 2.18.1 acceptance

## POEM 2.18.1 acceptance

- [ ] `20261008000910_ewallet_default_owner_fix.sql` is present/applied before 2.18.1.
- [ ] `20261008000920_ewallet_withdrawal_stabilization.sql` applies after 00910.
- [ ] Active `(provider, wallet number)` duplicates are resolved before migration; the unique index is not weakened.
- [ ] Run `npm run types:generate`, then `npm run preflight`.
- [ ] `node scripts/test-phase218.mjs` and `node scripts/test-phase2181.mjs` pass.
- [ ] Verification event keys cannot authorize a different wallet/outcome for the same provider.
- [ ] New verified wallets have a 24-hour withdrawal hold; only POEM Admin can use the labelled mock activation override.
- [ ] Five failed transaction-PIN checks persist and create a 15-minute lock; correct PIN cannot bypass an active lock.
- [ ] Authenticated clients cannot execute the old `configure_withdrawal_pin` mutation RPC.
- [ ] Withdrawal request-id lookup/allocation is serialized per account.
- [ ] Setting/spoofing `app.wallet_settlement` does not bypass pending payable reservations.
- [ ] Exact server-generated allocation payment/reversal request IDs still settle through `work_payable_events` and 2.17.2 finance bridge exactly once.
- [ ] Verified wallet details are immutable; unlink/relink requires fresh verification.
- [ ] Wallet/PIN/provider/verification-event sensitive tables remain direct-access denied and returned wallet numbers stay masked.
- [ ] No bank/IBAN payout path and no live JazzCash/Easypaisa credential/API is introduced.
- [ ] `npm run test:local`, `npm run test:operations`, historical 2.17/2.18 regressions and `git diff --check` are green before cloud push.

## POEM 2.18.0 acceptance

- [ ] `20261008000610_finance_rls_helper_execute_fix.sql`, 2.17.1 funding and 2.17.2 payable-finance bridge are applied and green before 2.18.0.
- [ ] `20261008000900_ewallet_mock_withdrawal_sandbox.sql` applies after the 2.17.2 migration head.
- [ ] Run `npm run types:generate`, then `npm run preflight`.
- [ ] `node scripts/test-phase218.mjs` passes all e-wallet / mock-withdrawal scenarios.
- [ ] Only JazzCash and Easypaisa are supported; no bank-account/IBAN payout UI or schema exists.
- [ ] Authenticated users cannot directly read/write wallet, PIN, withdrawal-allocation or provider-event tables.
- [ ] Wallet numbers returned to the UI are masked; mock verification is POEM-Admin-only and clearly states it is not live ownership proof.
- [ ] Transaction PIN is six digits and stored only as a server-side cryptographic verifier.
- [ ] Withdrawal requests reserve exact unpaid payable allocations and prevent double withdrawal/concurrent monetary payable mutation.
- [ ] Mock success creates existing `work_payable_events` payment entries exactly once and 2.17.2 moves Committed → Spent.
- [ ] Mock failure/cancel releases entitlement without payment; mock reversal restores payable/finance state through payment-reversal events.
- [ ] Replayed mock provider event keys are idempotent.
- [ ] UI is personal-workspace only and prominently labelled **Development sandbox** / no real money transfer.
- [ ] No live JazzCash/Easypaisa API endpoint, credential, callback secret or fake production integration is embedded.
- [ ] `npm run test:local`, `npm run test:operations`, prior 2.17 regressions and `git diff --check` are green before cloud push.

## POEM 2.17.2 acceptance

- [ ] `20261008000610_finance_rls_helper_execute_fix.sql` is present before project funding/bridge validation.
- [ ] `20261008000700_project_funding_reservation.sql` applies and 2.17.1 funding tests pass.
- [ ] `20261008000800_payable_finance_bridge_reconciliation.sql` applies locally.
- [ ] `node scripts/test-phase217.mjs` passes.
- [ ] `node scripts/test-phase2171.mjs` passes.
- [ ] `node scripts/test-phase2172.mjs` passes.
- [ ] Payable approval fails atomically when the project has insufficient reserved funding.
- [ ] Funded approval moves Reserved → Committed exactly once.
- [ ] Payment / reversal move Committed ↔ Spent without changing worker-entitlement history.
- [ ] Negative entitlement adjustment releases only unused commitment.
- [ ] Historical unbridged monetary events are detectable and can be replayed idempotently.
- [ ] Project Manager / Area Focal still cannot read or mutate central finance.
- [ ] No JazzCash/provider or withdrawal flow is introduced in 2.17.2.
- [ ] `npm run preflight`, `npm run test:local`, `npm run test:operations` pass before cloud push.

## POEM 2.17.0 acceptance

- [ ] `20261008000500_recruitment_discovery_compatibility_fix.sql` is present/applied (2.16.1 compatibility follow-up).
- [ ] `20261008000600_finance_core_double_entry_ledger.sql` applies after the current 2.16.1 chain.
- [ ] Run `npm run types:generate`, then `npm run preflight`.
- [ ] `node scripts/test-phase217.mjs` passes all finance-core/double-entry scenarios.
- [ ] Direct authenticated writes to `finance_accounts`, `finance_journals` and `finance_postings` are denied.
- [ ] Every journal is same-currency, has at least two postings and satisfies total debits = total credits.
- [ ] Journal/account/posting history is immutable; corrections create a linked reversal journal.
- [ ] Account balances are derived from postings; no editable NGO/project balance column exists.
- [ ] NGO Admin can read only its own organization ledger; Project Manager/Area Focal receive no finance access in this release.
- [ ] Exact idempotent retries return the same journal; conflicting retries/source reuse are rejected.
- [ ] Existing worker payable tables/functions remain authoritative and unchanged.
- [ ] No project funding/reservation, payable-finance bridge, JazzCash or withdrawal flow is introduced yet.
- [ ] `npm run test:local`, `npm run test:operations`, historical recruitment regressions and `git diff --check` are green before cloud push.


- [ ] `20261008000400_project_compensation_assignment_contract.sql` applies after the 2.16.0 target/capacity migration.
- [ ] Run `npm run types:generate` after the migration, then `npm run preflight`.
- [ ] `node scripts/test-phase216.mjs` passes the corrected legitimate recruitment-connection fixture.
- [ ] `node scripts/test-phase2161.mjs` passes compensation/default/assignment/payable scenarios.
- [ ] NGO Admin can configure project `volunteer`/`paid` defaults, basis, uppercase currency, positive two-decimal rate and note with optimistic concurrency.
- [ ] Project Manager can read/use compensation defaults but cannot change the project compensation commitment; Area Focal remains denied global compensation-plan access.
- [ ] New project opportunities snapshot the current compensation version; later project changes do not mutate historical opportunities.
- [ ] Formal assignment offers copy the authoritative opportunity/project snapshot and caller-supplied rate fields cannot override it.
- [ ] Assignment compensation/provenance is immutable once offered; volunteer acceptance confirms the frozen contract.
- [ ] Approved `per_verified_survey` work still creates at most one existing `work_payable_units` row per response; no second payable generator/table exists.
- [ ] Daily/fixed payable claim flows remain existing behavior.
- [ ] 2.16.0 soft target/offline synchronization behavior remains unchanged.
- [ ] `npm run test:local`, `npm run test:operations`, prior 2.14/2.15/2.16.0 regressions and `git diff --check` are green before cloud push.

# Previous release checklist — POEM 2.16.0

- [ ] `20261008000300_project_targets_recruitment_capacity.sql` applies after the 2.15.1 project-self-service migration.
- [ ] Run `npm run types:generate` after the new migration, then `npm run preflight`.
- [ ] `node scripts/test-phase216.mjs` passes all soft-target/recruitment-capacity scenarios.
- [ ] Target progress counts **approved** responses only and reports remaining/over-target values.
- [ ] Project required-volunteer capacity counts distinct offered/active work assignments plus active survey assignments without double-counting the same volunteer.
- [ ] At target/capacity/manual close, new published recruitment, fresh invitations and new assignment/direct-assignment activation are blocked by the database.
- [ ] Already-assigned volunteers can still save/synchronize survey responses after target reach; project status remains active until explicitly closed.
- [ ] Over-target approvals are retained/reported rather than discarded.
- [ ] NGO Admin / Project Manager can increase target/capacity and manually close/reopen recruitment with optimistic concurrency; Area Focal is denied the global plan RPC.
- [ ] Published opportunities disappear from new volunteer discovery when the effective gate closes without rewriting historical opportunity state.
- [ ] 2.16.0 does not change `save_survey_response()` or create a second payable/compensation system.
- [ ] `npm run test:local`, `npm run test:operations`, and 2.14/2.15 regression suites remain green before cloud push.
- [ ] `git diff --check` is clean before commit.

# Previous release checklist — POEM 2.15.1

- [ ] `20261008000200_ngo_project_self_service.sql` applies after the 2.15.0 template migration.
- [ ] `node scripts/test-phase2151.mjs` passes all NGO project-draft/approval scenarios.
- [ ] Active NGO Admins can save incomplete organization-owned project drafts and another active Admin of the same NGO can continue them.
- [ ] Other NGOs and ordinary members cannot read or mutate those drafts.
- [ ] Only POEM-owned templates and same-NGO approved templates can be selected; cross-NGO private template reuse is denied by the database.
- [ ] Submitted drafts lock editing; changes-requested drafts reopen; rejected/approved drafts remain locked.
- [ ] POEM approval creates exactly one active `survey_projects` row and stores `approved_project_id`; retry is idempotent.
- [ ] Direct POEM `create_survey_project()` also enforces template ownership.
- [ ] Project Manager and Area Focal Person permissions remain unchanged from 2.14.
- [ ] `npm run preflight`, `npm run test:local`, `npm run test:operations` pass before cloud push.
- [ ] `git diff --check` is clean before commit.

# Previous release checklist — POEM 2.15.0

- [ ] `20261008000100_ngo_template_self_service.sql` applies locally after the 2.14.2 migration head.
- [ ] `node scripts/test-phase215.mjs` passes all NGO template ownership/review scenarios.
- [ ] NGO Admin can create from blank/starter/published template and another active Admin of the same NGO can continue an editable draft.
- [ ] Submitted drafts lock editing; changes-requested drafts reopen; rejected/approved revisions stay locked.
- [ ] POEM approval atomically publishes one immutable NGO-owned template and records source/review history.
- [ ] Other NGOs, ordinary members, Project Managers and Area Focal Persons do not receive template-authoring/review authority.
- [ ] Existing POEM private draft direct publication still works.
- [ ] `npm run preflight`, `npm run test:local`, `npm run test:operations` pass before cloud push.

# Previous release checklist — POEM 2.14.2

## POEM 2.14.2 acceptance

- [ ] `node scripts/test-phase214.mjs`, `test-phase2141.mjs` and `test-phase2142.mjs` pass.
- [ ] `npm run preflight`, `npm run test:local` and `npm run test:operations` pass.
- [ ] Project Manager dashboard shows RLS-filtered target progress, active volunteer count, response states, visible area coverage and latest visible responses.
- [ ] **Open responses & reviews** opens the assigned project directly and back navigation returns to Project workspace.
- [ ] Response status filter is server-side and never widens project/geography visibility.
- [ ] Area Focal Person can review scoped responses but does not see direct survey-assignment management controls.
- [ ] Project Manager retains authorized assignment controls.
- [ ] Revoked project workspace returns to the personal workspace after reload/refresh.
- [ ] Project dashboard/roster/filters are usable at desktop, tablet and narrow mobile widths without page-level horizontal overflow.
- [ ] 2.14.2 adds no SQL migration; migration head remains `20261007000300_project_team_workspace_ui.sql`.
- [ ] `git diff --check` is clean before commit.

## 2.13.3 consolidation gate

- [ ] `package.json` and `package-lock.json` report 2.13.3.
- [ ] README, architecture, permissions and this checklist identify 2.13.3 as the current release.
- [ ] `npm run metadata:check` passes and generated `FILES.txt`, `project-tree.txt` and `PROJECT_ANALYSIS_CONTEXT.txt` are clean.
- [ ] `npm run release:consistency` passes.
- [ ] No 2.13.3 SQL migration exists; the migration head remains `20261006000200_invitation_access_scope_fix.sql`.
- [ ] `node scripts/test-phase2131.mjs` and `node scripts/test-phase2132.mjs` pass.
- [ ] `npm run preflight` passes.
- [ ] With local Supabase running, `npm run test:local` and `npm run test:operations` pass.
- [ ] Browser acceptance confirms Volunteer / Partner NGO / POEM Staff sign-in destinations, NGO onboarding routing, password visibility controls, reset flow and compact mobile authentication layout.
- [ ] `git diff --check` is clean before commit.

2.13.3 adds no business feature, migration, RLS change or auth-routing behavior. The remaining sections are historical release checks retained for regression context.
Before cloud migration or deployment:

- `npm run preflight` passes.
- `npm run test:local` passes against local Supabase Auth/Storage.
- `npm run test:operations` passes.
- Auth visibly offers **Volunteer**, **Partner NGO** and **POEM staff** sign-in destinations.
- Partner NGO sign-in with an approved `ngo_admin` membership opens that NGO workspace automatically.
- Partner NGO sign-in without active NGO membership opens **Partner NGO application** instead of a blank/non-NGO workspace.
- Approved onboarding screen has an **Open NGO workspace** action.
- Volunteer **My profile** contains no `NGO profile access`, `Allow profile access` or `Revoke access` controls.
- Open/public opportunities remain visible without `profile_shares`.
- Application snapshot still creates no permanent `profile_shares` row.
- Direct active survey assignment succeeds without a permanent profile grant and creates assignment-scoped NGO access.
- Deactivating the last scoped assignment removes that NGO's future live-profile access.
- Existing onboarding RLS/document isolation and 2.12.6 verified-work history regressions remain green.

Historical checklists below are retained for regression context.

> Current consolidated release: [2.13.3](PHASE-2.13.3.md). See [2.13.3 validation](VALIDATION-2.13.3.md). Older phase-specific statements below are historical.

> Phase 2.3: [Needs Assessment & Assistance Follow-up](PHASE-2.3.md) adds approved-survey assessments, assistance links and a follow-up queue. See [upgrade instructions](UPGRADE-2.3.md). Earlier sections describe their original release scope.

> Phase 2.2: [Registry Review & Assistance Ledger](PHASE-2.2.md) adds identity corrections, project-scoped match decisions and recorded deliveries. See [upgrade instructions](UPGRADE-2.2.md). Earlier-phase sections retain their historical scope.

> Phase 2.1 update: see [Survey & Registry Pilot](PHASE-2.1.md) for the current survey model, permissions and acceptance checks, and [upgrade instructions](UPGRADE-2.1.md) for existing installations. Earlier-phase sections below describe their original scope.

Historical Phase 1.4: see [experience/invitation workflow and permissions](PHASE-1.4.md) and [upgrade instructions](UPGRADE-1.4.md).

Historical Phase 1.3: see [upgrade commands](UPGRADE-1.3.md) and [acceptance checklist](PHASE-1.3.md). The following checklist covers inherited functionality.

# Release checklist

Both a full standalone package and a safe upgrade patch are supplied. Use UPGRADE-1.2.md for the Phase 1.2 standalone project. Neither archive migrates the older Sites source.

## Primary files

- `package.json`, `package-lock.json`, `.nvmrc`, `.env.example`, `.gitignore`
- `index.html`, `vite.config.ts`, `tsconfig.json`, `public/favicon.svg`
- `src/main.tsx`, `src/client.ts`, `src/App.tsx`, `src/style.css`
- `supabase/config.toml`
- `supabase/migrations/20260911000100_poem_foundation.sql`
- `scripts/local-env.mjs`, `scripts/bootstrap-admin.mjs`, `scripts/check-env.mjs`
- `scripts/test-database.mjs`, `scripts/test-local-auth.mjs`
- README and docs

## Manual acceptance

- Sign up and confirm an email from the local inbox.
- Login/logout and reset password with a fresh email link.
- Bootstrap the first admin; sign in to the admin workspace.
- Volunteer saves a draft, publishes directly without admin approval, edits again and remains active.
- Profile photo upload/change/remove works and displays only to authorized profile viewers.
- Another volunteer cannot read the profile by direct API request.
- NGO Admin sees only explicitly shared profiles; NGO B cannot see NGO A grants.
- Membership, organization, account and profile suspension revoke their relevant access.
- Revoked profile access no longer appears after reload.
- Profile publication does not depend on an admin approval queue; only Super Admin can manage another account's platform role.
- Validate mobile navigation, long names, form error preservation and email recovery redirects in your browser.

## Phase 1.2 manual acceptance

- Admin creates the full sourced hierarchy; inactive parent blocks new submission.
- An existing Phase 1.1 verified profile remains intact immediately after upgrade.
- Volunteer selects district, uploads PDF/JPG/PNG and cannot overwrite uploaded bytes.
- Incomplete upload can be finalized or removed; failed removal can be retried.
- Other volunteer and NGO (even with profile grant) cannot download or list private files.
- POEM admin rejects an evidence document, volunteer sees feedback and notification.
- Document review remains separate from profile publication.
- Changing/removing evidence does not unpublish the volunteer profile; stale document review versions are still rejected.
- Removal confirmation is shown; bytes disappear while document history remains.
- Own notifications can be marked read; other recipients cannot read/modify them.
- Test file input, long file names and geography controls on a narrow mobile screen.

## Git commands — NEW repository only

From `~/projects/poem-phase1.2`:

```bash
git init -b main
git add .
git status --short
git diff --cached --stat
git commit -m "Build POEM Phase 1.2 standalone foundation"
```

Confirm `.env.local` and `node_modules/` do not appear in staged files. After creating your intended EMPTY remote repository, replace the URL before running:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_POEM_REPOSITORY.git
git push -u origin main
```

Do not point this new project at the earlier `Volunteer` or JAS repository unless you intentionally choose to replace/merge that project's source.

## Phase 2.5 controlled data-sharing checks

- NGO B can request only for its own canonically-linked beneficiary record.
- NGO A sees the incoming request and can approve a strict subset or reject it.
- POEM can approve only a subset of NGO A's approved fields and cannot extend expiry.
- NGO B sees no NGO A raw survey, needs, assistance rows, documents or evidence through normal project access.
- Approved summary omits all fields outside the grant.
- Viewing the summary creates a `data_access_events.summary_viewed` record.
- Source NGO or POEM revocation blocks the next summary call.
- Canonical identity/version/link change blocks an old grant and requires new authorization.


## Phase 2.6 field reliability checks

- Survey form restores its encrypted device draft after close/reopen.
- Device persistence uses IndexedDB + AES-GCM and never `localStorage` for survey payloads.
- Save/Submit writes the exact request payload to the device queue before the network RPC.
- Offline Save/Submit returns control to the collector and remains queued across reloads.
- Reconnect triggers automatic sync with the original request UUID; no duplicate server response is created.
- Transient failures back off; SQL validation/version conflicts move to “needs attention” and never overwrite newer server state.
- Queue sync verifies the current authenticated user; another user cannot sync or see another user's queue counts.
- Project response list refreshes after a queued save is confirmed.
- Device-storage failure is surfaced; the UI must not falsely report an offline save as durable.
- Cold-start full offline workspace and offline file/photo upload remain explicitly out of scope.

## Phase 2.7 volunteer marketplace checks

- NGO publishes an opportunity only against its own active survey project and a project/sub-area geography.
- Unverified, unshared or out-of-area volunteers cannot discover/apply to that opportunity.
- Other NGOs cannot read an application or assignment through normal table access.
- NGO can shortlist/select/reject an application; stale review versions are rejected.
- Candidate finder uses location and aggregate work history without exposing another NGO's raw survey/case records.
- Formal assignment requires selected application, accepted invitation or selected shortlist source.
- Paid assignment terms include compensation basis/currency/rate; volunteer assignment uses `none` and no rate.
- Survey assignment remains inactive until the volunteer accepts formal terms.
- Completion/cancellation deactivates survey access and preserves auditable assignment history.
- Structured completion feedback stores five 1–5 categories but does not automatically change volunteer level/score.
- Closing a survey project cancels unresolved workforce operations and active field access.

## POEM 2.13

- [ ] `20261005000000_work_experience_target_ambiguity_fix.sql` applies locally.
- [ ] `20261005000100_partner_ngo_self_onboarding.sql` applies locally.
- [ ] `node scripts/test-phase213.mjs` passes.
- [ ] Personal account can save a Partner NGO draft.
- [ ] Submission requires legal proof, program and structured operating area.
- [ ] POEM reviewer can download/review evidence and request changes.
- [ ] Approval creates one active NGO and active first `ngo_admin` membership.
- [ ] Applicant can switch into approved NGO workspace after refresh.
- [ ] Unrelated authenticated/anonymous users cannot read onboarding records or Storage objects.
- [ ] Full `npm run preflight`, `npm run test:local`, `npm run test:operations` pass before cloud push.
