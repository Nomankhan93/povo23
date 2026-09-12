# POEM 2.5 validation

## Automated gates

`npm test` now includes `scripts/test-phase25.mjs` after all inherited migration/RLS suites.

The Phase 2.5 suite verifies:

- an unrelated NGO cannot discover another NGO's linked beneficiary or source records;
- a requesting NGO can discover a source organization only through its own canonically-linked project person;
- raw source survey, need and assistance rows remain hidden;
- source/requester context is scoped so each NGO sees only its own beneficiary record;
- NGO B cannot self-approve its request;
- NGO A can reduce requested fields but cannot add fields;
- POEM can only authorize source-approved fields;
- the grant is source-specific and time-limited;
- the shared summary contains only authorized fields and omits amount, funding source and evidence;
- every summary read appends a `summary_viewed` access event;
- source/unrelated NGOs cannot use the grantee-only summary RPC;
- canonical identity/link/version changes invalidate an old grant;
- source revocation immediately blocks future summary reads;
- after revocation the requester may create a fresh request;
- anonymous callers cannot use sharing RPCs.

## Manual UI checks

1. Open NGO B workspace → Data sharing.
2. Select a beneficiary already canonically linked to NGO A.
3. Request only selected field groups and a short expiry.
4. Open NGO A workspace and approve a reduced field set.
5. Open POEM administration and authorize an equal or smaller field set.
6. Return to NGO B and confirm the summary contains only approved fields.
7. Confirm NGO B still cannot open NGO A raw survey/assistance/need rows through normal project screens.
8. Revoke the grant from NGO A or POEM and confirm summary access fails immediately.

## Release boundary

This validation does not certify legal/privacy compliance, informed-consent wording, production monitoring, export controls, malware scanning, disaster recovery or security penetration testing. Those remain production-readiness work.
