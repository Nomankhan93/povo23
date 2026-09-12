# POEM 2.4.2 — Local operations cleanup compatibility

## Purpose

POEM 2.4 introduced automatic canonical identities for every new `registry_persons` row. The real local HTTP operations test still used the pre-2.4 fixture cleanup order, so it tried to delete a project registry person before removing its `canonical_person_links` row.

The product workflow itself passed, but PostgreSQL correctly blocked fixture teardown with foreign-key errors. That left synthetic organizations, projects and Auth users behind and made repeated local test runs less reliable.

## Change

2.4.2 updates only local integration-test cleanup behavior. It does not change production tables, RLS, RPCs or business workflows.

The cleanup now:

1. discovers the canonical identities linked to the current run's project people;
2. removes canonical match revisions and decisions that reference those fixture people;
3. removes fixture `canonical_person_links` before deleting `registry_persons`;
4. deletes the ordinary project/registry fixture rows in dependency order;
5. re-checks the discovered canonical identities and deletes only identities that have become orphaned;
6. removes canonical merge events only when both sides are orphaned fixture identities;
7. refuses to destroy an identity when non-fixture links or mixed merge history still reference it;
8. removes canonical revisions before canonical persons;
9. reports an explicit cleanup PASS when teardown is complete.

## Safety boundary

The cleanup remains ID-scoped. It never resets the local database and never performs broad table truncation.

If an unexpected non-fixture link or cross-fixture merge history exists, cleanup fails closed instead of deleting shared canonical history.

## Product impact

None. This is a test-harness compatibility release only.
