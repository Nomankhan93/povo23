# FieldLance 2.40.0 validation

Primary regression command:

```bash
npm run test:field-map-240
```

Then run the normal release gates:

```bash
npm run types:check
npm run metadata:check
npm run preflight
npm run test:local
git diff --check
```

The 2.40 test covers migration ordering, MapLibre/no-key UI wiring, self-only personal map semantics, Area Focal geography restriction, boundary classification, missing/poor location handling and preservation of the existing attendance/case systems.
