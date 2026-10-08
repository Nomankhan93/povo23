# Upgrade to FieldLance 2.41.20

2.41.20 is a frontend-only accessibility and UX-consistency patch.

## Upgrade

```bash
npm ci
npm run test:accessibility-24120
npm run test:observability-24119
npm run test:performance-24118
npm run test:mobile-production-24117
npm run check
npm run build
git diff --check
```

No Supabase migration or database push is required.

## Browser acceptance

Verify keyboard-only navigation through the sidebar and page content, confirmation dialogs, unsaved-authoring confirmation and Partner Organization submission success. On mobile/coarse-pointer hardware verify primary controls remain comfortably tappable. With reduced-motion enabled confirm transitions/animations no longer create unnecessary motion. Where available, verify high-contrast/forced-colors focus and selected states remain visible.
