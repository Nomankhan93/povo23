# FieldLance 2.36.0 validation

## Automated contract coverage

`npm run test:routing-236` verifies:

- personal / Organization / Staff / project route generation and parsing;
- application, assignment and case deep-link contracts;
- workspace scope is resolved against existing authorized workspace access rather than trusted from the URL;
- browser popstate navigation is protected by field-draft persistence;
- project tabs accept URL state;
- case detail restores from a route-provided case ID;
- recruitment record focus restores from route-provided application/assignment IDs;
- mobile Field Worker navigation has exactly the intended primary information architecture markers.

## Required release validation

- `npm run test:routing-236`
- `npm run check`
- `npm run release:consistency`
- `npm run preflight`

## Manual validation still required in the installation

- authenticated browser Back/Forward and hard-refresh behavior;
- iOS/Android-sized viewport behavior and safe-area padding;
- direct-link behavior for multiple real Organization / project permissions;
- failed field-draft persistence during browser history navigation;
- hosting configuration serves the SPA entry point for deep URLs rather than returning a web-server 404.

No database migration is part of 2.36.0.
