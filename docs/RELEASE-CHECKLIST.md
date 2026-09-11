Current Phase 1.4: see [experience/invitation workflow and permissions](PHASE-1.4.md) and [upgrade instructions](UPGRADE-1.4.md).

For the current Phase 1.3 release, use [upgrade commands](UPGRADE-1.3.md) and [acceptance checklist](PHASE-1.3.md). The following checklist covers inherited functionality.

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
- Volunteer saves a draft, submits, gets correction feedback, resubmits and receives verification.
- Editing after verification removes the previous approval.
- Another volunteer cannot read the profile by direct API request.
- NGO Admin sees only explicitly shared profiles; NGO B cannot see NGO A grants.
- Membership, organization, account and profile suspension revoke their relevant access.
- Revoked profile access no longer appears after reload.
- Admin cannot approve themselves or assign platform roles; only Super Admin can manage another account's platform role.
- Validate mobile navigation, long names, form error preservation and email recovery redirects in your browser.

## Phase 1.2 manual acceptance

- Admin creates the full sourced hierarchy; inactive parent blocks new submission.
- An existing Phase 1.1 verified profile remains intact immediately after upgrade.
- Volunteer selects district, uploads PDF/JPG/PNG and cannot overwrite uploaded bytes.
- Incomplete upload can be finalized or removed; failed removal can be retried.
- Other volunteer and NGO (even with profile grant) cannot download or list private files.
- POEM admin rejects an evidence document, volunteer sees feedback and notification.
- Approval fails until every current document is accepted and checklist completed.
- Changing/removing evidence invalidates approval and stale review versions are rejected.
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
