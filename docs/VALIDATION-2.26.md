# 2.26 validation checklist

- `npm run types:check`
- `npm run check`
- `npm run test:funding-assurance`
- Existing payment, payable, bridge, wallet, identity and navigation regressions
- `npm run preflight`
- Verify an underfunded paid opportunity is rejected atomically
- Verify expiry/cancellation releases only unused commitment exposure
- Verify closure cannot skip collection, operational, and finance gates
- Verify unrelated organizations cannot read or mutate assurance/closure state
