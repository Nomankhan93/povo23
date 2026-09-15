# POEM 2.12.2 — Survey Template Library & Draft Editing

Baseline: POEM 2.12.1 (area selection patch). Apply that patch first if package.json is still 2.12.0. This patch preserves existing project/template records and prior migrations. No reset.

## WSL apply

Save poem-template-library-2.12.2-patch.zip under /home/noman/projects.

```bash
cd /home/noman/projects/poem-phase1.1
patch_dir=$(mktemp -d /tmp/poem-template-library.XXXXXX)
unzip -n /home/noman/projects/poem-template-library-2.12.2-patch.zip -d "$patch_dir"
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1 --check &&
python3 "$patch_dir/apply_patch.py" --project /home/noman/projects/poem-phase1.1
nvm use
npm ci && npm run preflight
```

Installer validates baseline hashes, refuses unexpected edits, and creates backups. Do not bypass a stopped check; merge local changes first.

## Database before frontend

Local:
```bash
npx supabase start && npx supabase migration up --local
npm run dev
```

Cloud: confirm linked project and migration history before applying:
```bash
npx supabase migration list
npx supabase db push --dry-run
```
After checking the target and pending migration list:
```bash
npx supabase db push
```

Deploy frontend only after successful migration. Do not reset the database. The new migration is `20261001000100_template_drafts.sql`; this filename follows the existing migration sequence and is not an execution date requirement.

## Commit

Review changed files and exclude local secrets:
```bash
git status --short
git add src/features/surveys/SurveyTemplates.tsx src/features/surveys/TemplatePreview.tsx src/features/surveys/templateLibrary.ts src/lib/supabase/database.types.ts supabase/migrations/20261001000100_template_drafts.sql scripts/test-template-library.mjs package.json package-lock.json README.md FILES.txt docs/UPGRADE-2.12.2.md docs/PHASE-2.12.2.md docs/VALIDATION-2.12.2.md
git commit -m "Add survey template library and private versioned drafts"
git push
```
