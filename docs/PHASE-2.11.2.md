# POEM 2.11.2 — Official branding

Apply after 2.11.1. Uses the two supplied JPEG logos, unchanged, through a shared PoemBrand component. Horizontal logo appears on login and sidebar; circular logo appears in field workspace and browser tab. Mobile login includes the horizontal logo when the story panel is hidden. Logos retain their original aspect ratio and white background.

Logo-derived palette (approximate design tokens): teal #00989d, blue #1698bc, orange #f39212, warm red #e74b2c and deep teal #093f40. Primary buttons use darker #007b80 for white-text readability. Orange highlights navigation and field cards; semantic failure states retain red and visible text. No palette changes imply verification or permission changes.

Brand assets are imported through Vite and receive hashed asset URLs. The existing static worker includes them in its asset inventory for offline use. No remote fonts or logo requests. Existing generic favicon.svg remains as a legacy cached asset but the page icon now references the official emblem.

No new migration, dependency, authentication, scoring, data or queue changes.

Validation: TypeScript/production build, existing static-worker checks and four workflow UI checks passed. Logo bytes match the supplied originals. All 20 migrations remain unchanged. Installer evidence covers 8 guarded-apply scenarios. Real browser/mobile checks remain pending.

Manual check: login on desktop/mobile, sidebar open/closed, field mode offline after install, browser icon, worker update banner, logo sizing at 200% zoom and readable active navigation/buttons. Do not force-reload a field session with unsaved work just to update branding.

Build note: Vite emitted a chunk-size warning for the approximately 538 kB main JavaScript chunk (148 kB gzip); build succeeded. Bundle splitting is a follow-up performance item.
