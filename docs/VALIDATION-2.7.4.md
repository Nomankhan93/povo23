# 2.7.4 Validation

Required checks:

- `node scripts/test-profile-independence-photo.mjs`
- `npm run preflight`
- `npm run test:local`
- `npm run test:operations`

Manual UI checks:

- My profile no longer embeds Work experience or Private documents.
- Both appear as sidebar destinations.
- Publish profile requires current mandatory fields but no admin action.
- Saving a published profile leaves it active.
- Profile photo upload/change/remove works and displays on own/shared profile.
- Private-document changes do not remove the active profile from workforce access.
