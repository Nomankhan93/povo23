# POEM 2.4.2 validation

## Required checks

```bash
npm run preflight
npm run test:local
npm run test:operations
```

## Acceptance criteria

`test:operations` must confirm the real local HTTP workflow still passes:

- concurrent survey retry/idempotency;
- survey review;
- needs and assistance flow;
- void follow-up;
- NGO isolation;
- membership restriction;
- closed-project revocation.

It must then remove all current-run fixtures without foreign-key errors and print:

```text
PASS fixture cleanup: canonical links, orphan identities and local operation fixtures removed.
```

The run is not accepted if it prints `Fixture cleanup incomplete` or leaves the process with a non-zero exit code.

## Regression guarded by this release

Before 2.4.2, the cleanup attempted to remove `registry_persons` while `canonical_person_links` still referenced them, which cascaded into household, project, organization and Auth-user cleanup failures.

2.4.2 makes the teardown canonical-aware while retaining the existing safety rule: delete only IDs created by that test run and never reset/truncate the database.
