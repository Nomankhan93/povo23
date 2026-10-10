import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';

const read=p=>readFileSync(p,'utf8');
const pkg=JSON.parse(read('package.json'));
const action=read('src/components/ui/ActionDialog.tsx');
const foundationUi=read('src/components/ui/FieldLanceUI.tsx');
const focus=read('src/components/system/focusManagement.ts');
const authoring=read('src/shared/authoringNavigation.tsx');
const shell=read('src/app/AppShell.tsx');
const boundary=read('src/components/system/AppErrorBoundary.tsx');
const ngo=read('src/features/organizations/PartnerNgoApplication.tsx');
const worker=read('src/features/workforce/FieldWorkerDashboard.tsx');
const org=read('src/features/organizations/OrganizationDashboard.tsx');
const staff=read('src/features/operations/FieldLanceStaffDashboard.tsx');
const project=read('src/features/surveys/SurveyProjectDetail.tsx');
const css=read('src/styles/design-system.css');
let passed=0;
const ok=(name,fn)=>{fn();passed++;console.log('PASS '+name)};

ok('2.41.20 release and targeted accessibility command are registered',()=>{
  assert.ok(['2.41.20','2.42.0','2.42.1','2.42.2','2.42.3','2.42.4','2.42.5','2.42.6','2.42.7'].includes(pkg.version));
  assert.equal(pkg.scripts['test:accessibility-24120'],'node scripts/test-accessibility24120.mjs');
});

ok('shared action dialogs have unique labelling, focus containment and Escape handling',()=>{
  assert.match(action,/useId\(\)/);
  assert.match(action,/aria-labelledby=\{titleId\}/);
  assert.match(action,/aria-describedby=\{description \? descriptionId/);
  assert.match(action,/aria-busy=\{busy \|\| undefined\}/);
  assert.match(action,/trapFocus\(event, dialogRef\.current\)/);
  assert.match(action,/event\.key === "Escape"/);
  assert.match(focus,/button:not\(:disabled\)/);
  assert.match(focus,/document\.activeElement === last/);
});

ok('unsaved-authoring confirmation uses one modal boundary instead of nested dialogs',()=>{
  const guard=authoring.slice(authoring.indexOf('export function AuthoringNavigationGuard'),authoring.indexOf('/** Keep the current entry'));
  assert.match(guard,/<ActionDialog/);
  assert.doesNotMatch(guard,/<dialog/);
  assert.doesNotMatch(guard,/showModal\(/);
});

ok('SPA navigation and crash containment move focus to meaningful recovery/content targets',()=>{
  assert.match(shell,/workspaceFocusKey/);
  assert.match(shell,/getElementById\("workspace-content"\)\?\.focus/);
  assert.match(shell,/aria-labelledby="workspace-page-title"/);
  assert.match(shell,/<PageHeader/);
  assert.match(foundationUi,/id = "workspace-page-title"/);
  assert.match(boundary,/headingRef/);
  assert.match(boundary,/tabIndex=\{-1\}/);
  assert.match(boundary,/headingRef\.current\?\.focus/);
});

ok('Partner NGO success modal traps focus, restores focus and exposes its description',()=>{
  assert.match(ngo,/successDialogRef/);
  assert.match(ngo,/successPrimaryRef/);
  assert.match(ngo,/return \(\) => previous\?\.focus\?\.\(\)/);
  assert.match(ngo,/aria-describedby="ngo-submit-success-description"/);
  assert.match(ngo,/trapFocus\(event, successDialogRef\.current\)/);
  assert.match(ngo,/event\.key === "Escape"/);
});

ok('blocking dashboard and moderation errors use assertive alert semantics',()=>{
  for(const source of [worker,org,staff])assert.match(source,/className="notice error" role="alert">\{error\}/);
  assert.match(project,/<Alert title="FieldLance moderation is active" tone="danger">/);
});

ok('mobile/coarse-pointer, reduced-motion, high-contrast and RTL fallbacks are explicit',()=>{
  assert.match(css,/@media\(pointer:coarse\)/);
  assert.match(css,/button,summary\{min-height:44px\}/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/animation-duration:\.01ms!important/);
  assert.match(css,/@media\(prefers-contrast:more\)/);
  assert.match(css,/@media\(forced-colors:active\)/);
  assert.match(css,/\[dir="rtl"\] \.sidebar nav button\.active/);
});

ok('navigation notification count avoids duplicate screen-reader announcement',()=>{
  assert.match(shell,/header-notification-count" aria-hidden="true"/);
  assert.match(shell,/aria-label=\{unreadNotifications \? `Notifications, \$\{unreadNotifications\} unread`/);
  assert.match(shell,/type="button" className="drawer-close"/);
});

ok('2.41.20 adds no database migration or accessibility runtime dependency',()=>{
  const migrations=readdirSync(path.join(process.cwd(),'supabase/migrations')).filter(x=>x.endsWith('.sql')).sort();
  assert.equal(migrations.at(-1),'20261013000580_project_lifecycle_e2e_integrity.sql');
  const dependencies={...(pkg.dependencies||{}),...(pkg.devDependencies||{})};
  for(const name of Object.keys(dependencies))assert.doesNotMatch(name,/axe-core|react-aria|reach-ui|radix/i);
});

console.log(`\n${passed} FieldLance 2.41.20 accessibility and UX consistency scenarios passed.`);
