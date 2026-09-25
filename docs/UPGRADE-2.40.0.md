# Upgrade to FieldLance 2.40.0

Apply on top of a fully migrated 2.39.0 database.

```bash
cd /home/noman/projects/poem-phase1.1
nvm use
npm ci
npx supabase start
npx supabase migration up --local
npm run types:generate
npm run types:check
npm run metadata:generate
npm run metadata:check
npm run test:field-map-240
npm run preflight
npm run test:local
```

Only after local validation passes:

```bash
npx supabase db push
git diff --check
git status
```

## Boundary data

The map works without uploaded administrative polygons, but `within_assigned_area` / `outside_assigned_area` cannot be determined until an authoritative Polygon/MultiPolygon GeoJSON boundary is attached through **Geography → Geographic boundaries for field-quality checks**.

Do not use approximate hand-drawn boundaries as authoritative production evidence without documenting their source.
