# POEM 2.7.3 validation

Required release checks:

- `npm run preflight`
- `node scripts/test-profile-structured-ui.mjs`
- `npm run test:local`
- `npm run test:operations`

Manual checks:

- Education dropdown saves standard levels and an `Other` value.
- Skills and languages support multiple checked values, search, removal and custom `Other` entries.
- Preferred work areas can add more than one District/Taluka and remove a selection.
- References support add/edit/remove without exposing raw JSON in profile views.
- Existing old skills/languages/education/reference text remains understandable when the profile opens.
- My profile shows structured Work experience and NGO confirmation workflow.
- Mobile layout keeps checkbox lists, reference cards and geography controls usable.
