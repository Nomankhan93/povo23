# POEM 2.12 acceptance checklist

Use synthetic test data and separate accounts: volunteer A, NGO A admin, second admin who is also a paid recipient, NGO B admin, ordinary POEM staff. Do not test by transferring real money.

1. Existing volunteer self-publication, marketplace contracts, survey collection and offline reconnect/recovery still work.
2. Accept a paid per-survey assignment; create/submit/review a response. Confirm submitted produces no unit, independent approval produces exactly one pending unit with agreed rate.
3. Financially approve, record PKR 50.10 of a PKR 120.25 unit. Confirm balance PKR 70.15. Repeat a retained request after simulated lost response; no second payment. Reload and inspect the journal before another manual action.
4. Attempt oversized payment, more than two decimals, stale version and duplicate reference. Each must fail without journal/notification side effects. In two concurrent browser sessions submit competing payments against one unit; only the eligible current-version action may succeed.
5. NGO B and unrelated POEM staff cannot read NGO A statements or receipts through UI or API. Recipient who is NGO Admin cannot approve/pay their own unit. Suspended membership loses organization operations.
6. Upload a real PDF/JPEG/PNG receipt under 5 MiB. Complete payment, open signed download as recipient; foreign NGO is denied. Test wrong MIME, missing upload and oversized upload. Verify production Storage metadata shape matches expected size/mimetype.
7. Dispute as volunteer, check payment is blocked, resolve as NGO. Reverse payment; repeat reversal must fail. Original event remains visible.
8. Correct/reject a previously approved survey through supported workflow. Confirm offset adjustment and negative balance if paid. Reapprove: same unit/rate, new financial approval required.
9. Submit daily claim twice; only one per UTC day. Reject future dates. Complete fixed assignment and claim once; use completion day capped at contract end.
10. Offer a future rate amendment. NGO cannot accept for volunteer. Volunteer accepts before start day; existing units unchanged. In a controlled test environment verify future work uses accepted amended rate, declined/pending offers do not.
11. Older approved response: reconcile by ID twice; only one unit. Survey created before acceptance or received after contract dates must not become automatically payable.
12. Check 50-row paging, filters, currency-separated totals, mobile controls/keyboard, long reasons/references, journal event IDs and visible failure/retry notices.
13. Review audit events, backup/retention configuration and abandoned receipt handling before production use.
