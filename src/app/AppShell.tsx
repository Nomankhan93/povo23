import {FieldLanceBrand} from "../components/ui/FieldLanceBrand";
import {WorkflowOverview} from "../components/ui/WorkflowOverview";
import {navigationGroups, organizationPageLabel, staffPageLabel, workspaceLabels, workspacePageLabel} from "./navigation";
import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
  CreditCard,
  HeartHandshake,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Plus,
  ShieldCheck,
  Share2,
  UserRound,
  Users,
} from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { EventList } from "../features/audit/EventList";
import { AccountAccess } from "../features/auth/AccountAccess";
import { consumeWorkspaceEntryIntent } from "../features/auth/entryIntent";
import { GeographyManager } from "../features/geography/GeographyManager";
import { type Geo } from "../features/geography/model";
import { Notifications } from "../features/notifications/Notifications";
import { DataSharingWorkspace } from "../features/sharing/DataSharingWorkspace";
import { MembershipActions } from "../features/organizations/MembershipActions";
import { MembershipForm } from "../features/organizations/MembershipForm";
import { NgoOperations } from "../features/organizations/NgoOperations";
import { OrgForm } from "../features/organizations/OrgForm";
import { PartnerNgoApplication } from "../features/organizations/PartnerNgoApplication";
import { PartnerNgoApplicationsReview } from "../features/organizations/PartnerNgoApplicationsReview";
import { OrganizationLogoImage } from "../features/organizations/OrganizationLogo";
import { OrganizationDashboard } from "../features/organizations/OrganizationDashboard";
import { FieldLanceStaffDashboard } from "../features/operations/FieldLanceStaffDashboard";
import { ProjectTeamWorkspace } from "../features/projects/ProjectTeamWorkspace";
import { APP_VERSION } from "./version";
const PayablesWorkspace = lazy(()=>import("../features/payables/PayablesWorkspace").then(m=>({default:m.PayablesWorkspace})));
const ProjectFundingWorkspace = lazy(()=>import("../features/finance/ProjectFundingWorkspace").then(m=>({default:m.ProjectFundingWorkspace})));
const EWalletWithdrawalWorkspace = lazy(()=>import("../features/payments/EWalletWithdrawalWorkspace").then(m=>({default:m.EWalletWithdrawalWorkspace})));
const MockEWalletSandbox = lazy(()=>import("../features/payments/MockEWalletSandbox").then(m=>({default:m.MockEWalletSandbox})));
const WithdrawalOperationsWorkspace = lazy(()=>import("../features/payments/WithdrawalOperationsWorkspace").then(m=>({default:m.WithdrawalOperationsWorkspace})));
const BeneficiaryCasesWorkspace = lazy(()=>import("../features/cases/BeneficiaryCasesWorkspace").then(m=>({default:m.BeneficiaryCasesWorkspace})));
const AssistanceLedgerWorkspace = lazy(()=>import("../features/assistance/AssistanceLedgerWorkspace").then(m=>({default:m.AssistanceLedgerWorkspace})));
const VerificationWorkspace = lazy(() => import("../features/verification/VerificationWorkspace").then(m => ({default:m.VerificationWorkspace})));
const ProjectGovernance = lazy(() => import("../features/governance/ProjectGovernance").then(m => ({default:m.ProjectGovernance})));
const CanonicalWorkbench = lazy(() => import("../features/registry/canonical/CanonicalWorkbench").then(m => ({ default: m.CanonicalWorkbench })));
const SurveyProjects = lazy(() =>
  import("../features/surveys/SurveyProjects").then((m) => ({
    default: m.SurveyProjects,
  })),
);
const SurveyTemplates = lazy(() =>
  import("../features/surveys/SurveyTemplates").then((m) => ({
    default: m.SurveyTemplates,
  })),
);
import {flushActiveDraft} from "../features/surveys/activeDraft";
import {fieldInventory,lockFieldDevice} from "../features/surveys/offlineSurveyStore";
import { SurveySyncStatus } from "../features/surveys/SurveySyncStatus";

import { Directory } from "../features/volunteers/Directory";
import { Documents } from "../features/volunteers/Documents";
import { ExperiencePanel } from "../features/volunteers/ExperiencePanel";
import { ProfileDetailsView } from "../features/volunteers/ProfileDetailsView";
import { ProfileForm } from "../features/volunteers/ProfileForm";
import { ProfilePhoto } from "../features/volunteers/ProfilePhoto";
import { InvitationsPanel } from "../features/workforce/InvitationsPanel";
import { WorkforceMarketplace } from "../features/workforce/WorkforceMarketplace";
import { FieldWorkerDashboard } from "../features/workforce/FieldWorkerDashboard";
import { db, rpc } from "../lib/supabase/client";
import type { Database } from "../lib/supabase/database.types";
import { Row } from "../shared/legacyTypes";
import { Badge, human } from "../shared/ui/FormFields";
export function Workspace({ session, openField }: { session: Session; openField:()=>void }) {
  const [account, setAccount] = useState<Row | null>(null),
    [profiles, setProfiles] = useState<Row[]>([]),
    [orgs, setOrgs] = useState<Row[]>([]),
    [members, setMembers] = useState<Row[]>([]),
    [projectStaff, setProjectStaff] = useState<Row[]>([]),
    [staffProjects, setStaffProjects] = useState<Row[]>([]),
    [accounts, setAccounts] = useState<Row[]>([]),
    [events, setEvents] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPageState] = useState("Overview"),
    [scope, setScope] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Row | null>(null),
    [orgEdit, setOrgEdit] = useState<Row | null>(null),
    [menu, setMenu] = useState(false),
    [geographies, setGeographies] = useState<Geo[]>([]),
    [notifications, setNotifications] = useState<import('../lib/supabase/database.types').Database['public']['Tables']['notifications']['Row'][]>([]);
  useEffect(()=>{
    if(!menu)return;
    const media=window.matchMedia('(max-width:800px)');
    const closeOnDesktop=()=>{if(!media.matches)setMenu(false)};
    closeOnDesktop();media.addEventListener('change',closeOnDesktop);
    const drawer=document.getElementById('workspace-navigation');
    const main=document.getElementById('workspace-main');
    if(media.matches){main?.setAttribute('inert','');drawer?.querySelector<HTMLElement>('button,select')?.focus()}
    const trap=(event:KeyboardEvent)=>{
      if(event.key!=='Tab'||!media.matches||!drawer)return;
      const items=Array.from(drawer.querySelectorAll<HTMLElement>('button:not(:disabled),select,a[href]')).filter(el=>el.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
    };
    document.addEventListener('keydown',trap);
    return()=>{main?.removeAttribute('inert');media.removeEventListener('change',closeOnDesktop);document.removeEventListener('keydown',trap)};
  },[menu]);
  function setPage(next:string){void flushActiveDraft().then(()=>setPageState(next)).catch(e=>setError("Could not protect device draft: "+e.message))}
  const admin =
      account &&
      [
        "admin",
        "super_admin",
        "volunteer_manager",
        "ngo_manager",
        "auditor",
        "survey_manager",
      ].includes(account.platform_role),
    poem = admin && scope === "poem",
    superAdmin = poem && account?.platform_role === "super_admin";
  const volunteers =
      poem &&
      ["admin", "super_admin", "volunteer_manager"].includes(
        account?.platform_role,
      ),
    ngos =
      poem &&
      ["admin", "super_admin", "ngo_manager"].includes(account?.platform_role);
  const surveyManage = Boolean(
    poem &&
      ["super_admin", "admin", "survey_manager"].includes(
        account?.platform_role,
      ),
  );
  const financeManage = Boolean(poem && ["admin", "super_admin"].includes(account?.platform_role));
  const [revision, setRevision] = useState(0);
  const entryHandled = useRef(false);
  async function load() {
    setError("");
    try {
      const a = await db!
        .from("accounts")
        .select("*")
        .eq("id", session.user.id)
        .single();
      if (a.error) throw a.error;
      setAccount(a.data);
      if (a.data.status === "suspended") {
        setProfiles([]);
        setOrgs([]);
        setLoading(false);
        return;
      }
      const res = await Promise.all([
        db!
          .from("volunteer_profiles")
          .select("*")
          .eq("user_id", session.user.id),
        db!.from("organizations").select("*").order("name").limit(500),
        db!.from("organization_memberships").select("*").limit(1000),
        db!
          .from("audit_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        db!.from("accounts").select("*").order("full_name").limit(500),
        db!
          .from("notifications")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100),
        db!
          .from("volunteer_profiles")
          .select("*")
          .eq("user_id", session.user.id)
          .single(),
      ]);
      for (const r of res) if (r.error) throw r.error;
      setProfiles([
        res[6].data!,
        ...(res[0].data || []).filter(
          (p: Row) => p.user_id !== session.user.id,
        ),
      ]);
      setOrgs(res[1].data || []);
      setMembers(res[2].data || []);
      setEvents(res[3].data || []);
      setAccounts(res[4].data || []);
      setNotifications(res[5].data || []);
      setRevision((n) => n + 1);
      const geoRows: Geo[] = [];
      for (let offset = 0; ; offset += 1000) {
        const g = await db!
          .from("geographies")
          .select("*")
          .order("id")
          .range(offset, offset + 999);
        if (g.error) throw g.error;
        geoRows.push(...(g.data || []));
        if ((g.data || []).length < 1000) break;
      }
      setGeographies(geoRows);
      const staffAssignments = await db!
        .from("project_staff_assignments")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("status", "active");
      if (staffAssignments.error) throw staffAssignments.error;
      const activeStaffAssignments = staffAssignments.data || [];
      setProjectStaff(activeStaffAssignments as Row[]);
      const staffProjectIds = [...new Set(activeStaffAssignments.map((item) => item.project_id))];
      if (staffProjectIds.length) {
        const projectRows = await db!
          .from("survey_projects")
          .select("*")
          .in("id", staffProjectIds)
          .order("title");
        if (projectRows.error) throw projectRows.error;
        setStaffProjects((projectRows.data || []) as Row[]);
      } else {
        setStaffProjects([]);
      }
      const platformRole = a.data.platform_role;
      const staffRole = [
        "admin",
        "super_admin",
        "volunteer_manager",
        "ngo_manager",
        "auditor",
        "survey_manager",
      ].includes(platformRole);
      const activeNgoMembership = (res[2].data || []).find(
        (m) =>
          m.user_id === session.user.id &&
          m.role === "ngo_admin" &&
          m.status === "active" &&
          (res[1].data || []).some(
            (o) => o.id === m.organization_id && o.status === "active",
          ),
      );
      const defaultScope = staffRole
        ? "poem"
        : activeNgoMembership?.organization_id
          || (activeStaffAssignments[0]?.project_id ? `project:${activeStaffAssignments[0].project_id}` : "personal");
      if (!entryHandled.current) {
        const intent = consumeWorkspaceEntryIntent();
        entryHandled.current = true;
        if (intent === "ngo") {
          if (activeNgoMembership) {
            setScope(activeNgoMembership.organization_id);
            setPageState("Overview");
          } else if (activeStaffAssignments[0]?.project_id) {
            setScope(`project:${activeStaffAssignments[0].project_id}`);
            setPageState("Project workspace");
            setNotice("Your account has project-scoped NGO access. Organization-wide NGO administration is not enabled.");
          } else {
            setScope("personal");
            setPageState("Partner NGO application");
            setNotice("No active Partner NGO workspace is linked to this account yet. Continue or review your Partner NGO application below.");
          }
        } else if (intent === "volunteer") {
          setScope("personal");
          setPageState("Overview");
        } else if (intent === "poem") {
          setScope(staffRole ? "poem" : "personal");
          setPageState("Overview");
          if (!staffRole)
            setNotice("This account does not have FieldLance Staff access. Your personal workspace is open instead.");
        } else {
          setScope((old) => old || defaultScope);
        }
      } else {
        setScope((old) => old || defaultScope);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, [session.user.id]);
  async function act(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try{await flushActiveDraft()}catch(e){setError((e as Error).message);return;}
    try{const copies=await fieldInventory(session.user.id);if((copies.queue.length||copies.drafts.length)&&!window.confirm("Unsynchronized field copies remain on this device. Sign out and retain them encrypted for this account? Use Offline field → Erase my device data for explicit shared-device cleanup."))return;}catch{if(!window.confirm("Device inventory unavailable. Sign out without deleting any field copies?"))return;}
    lockFieldDevice();
    const { error } = await db!.auth.signOut({scope:'local'});
    if (error) setError(error.message);
  }
  const my = profiles.find((p) => p.user_id === session.user.id),
    myOrgs = orgs.filter(
      (o) =>
        o.status === "active" &&
        members.some(
          (m) =>
            m.organization_id === o.id &&
            m.user_id === session.user.id &&
            m.role === "ngo_admin" &&
            m.status === "active",
        ),
    );
  const projectScope = scope.startsWith("project:");
  const projectScopeId = projectScope ? scope.slice("project:".length) : null;
  const projectScopeAssignment = projectScopeId ? projectStaff.find((item) => item.project_id === projectScopeId) : null;
  const projectScopeProject = projectScopeId ? staffProjects.find((item) => item.id === projectScopeId) : null;
  const validScope =
    poem || scope === "personal" || myOrgs.some((o) => o.id === scope) || Boolean(projectScopeId && projectScopeProject);
  const canManageProjectAssignments = Boolean(
    surveyManage ||
    (!poem && scope !== "personal" && !projectScope) ||
    (projectScope && projectScopeAssignment?.role === "project_manager"),
  );
  useEffect(() => {
    if (loading || !projectScope || validScope) return;
    setScope("personal");
    setPageState("Overview");
    setNotice("Your project workspace access is no longer active. Your personal workspace is open instead.");
  }, [loading, projectScope, validScope]);
  const organizationWorkspace = !poem && !projectScope && myOrgs.some((item) => item.id === scope);
  const standardNav = [
    ["Overview", LayoutDashboard],
    ["My profile", UserRound],
    ...(!poem
      ? [
          ["Work experience", Users],
          ["Private documents", ShieldCheck],
        ]
      : []),
    ...(volunteers || (!poem && scope !== "personal")
      ? [["Volunteers", Users]]
      : []),
    ...(!poem && scope === "personal" ? [["Partner NGO application", Building2]] : []),
    ...(ngos ? [["NGO applications", Building2]] : []),
    ["Partner NGOs", Building2],
    ["Survey projects", ShieldCheck],
    ...(!poem && scope !== "personal" ? [["Project team", Users]] : []),
    ["Verification", ShieldCheck],
    ...(surveyManage || (!poem && scope !== "personal") ? [["Project governance", ShieldCheck]] : []),
    ...(surveyManage || (!poem && scope !== "personal") ? [["Survey templates", ShieldCheck]] : []),
    ...(surveyManage ? [["Canonical registry", ShieldCheck]] : []),
    ...(surveyManage || (!poem && scope !== "personal" && !projectScope) ? [["Beneficiary cases", HeartHandshake], ["Assistance ledger", HeartHandshake]] : []),
    ...(surveyManage || (!poem && scope !== "personal") ? [["Data sharing", Share2]] : []),
    ...(surveyManage || (!poem && scope !== "personal") ? [["Workforce marketplace", Users]] : []),
    ...(!poem && scope === "personal" ? [["Available Opportunities", Users], ["My Applications", Users], ["My Assigned Surveys", Users]] : []),
    ...(!poem ? [["Invitations", Bell], ["Workforce payables", Users]] : []),
    ...(!poem && scope === "personal" ? [["E-Wallets & withdrawals", CreditCard]] : []),
    ...(financeManage || (!poem && scope !== "personal" && !projectScope) ? [["Project funding", Activity]] : []),
    ...(financeManage ? [["Withdrawal operations", CreditCard], ["E-Wallet sandbox", CreditCard]] : []),
    ...(poem && ["admin", "super_admin"].includes(account.platform_role)
      ? [["Memberships", Users]]
      : []),
    ...(superAdmin ? [["Accounts", KeyRound]] : []),
    ...(ngos ? [["Geography", MapPin]] : []),
    ["Notifications", Bell],
    ["Activity", Activity],
  ] as unknown as readonly (readonly [string, typeof LayoutDashboard])[];
  const organizationNav = ([
    ["Overview", LayoutDashboard],
    ["Survey projects", ShieldCheck],
    ["Project team", Users],
    ["Workforce marketplace", Users],
    ["Volunteers", Users],
    ["Invitations", Bell],
    ["Survey templates", ShieldCheck],
    ["Project governance", ShieldCheck],
    ["Beneficiary cases", HeartHandshake],
    ["Assistance ledger", HeartHandshake],
    ["Data sharing", Share2],
    ["Workforce payables", Users],
    ["Project funding", Activity],
    ["Notifications", Bell],
    ["Activity", Activity],
  ] as unknown as readonly (readonly [string, typeof LayoutDashboard])[]);
  const staffNav = ([
    ["Overview", LayoutDashboard],
    ...(volunteers ? [["Volunteers", Users]] : []),
    ...(ngos ? [["NGO applications", Building2]] : []),
    ["Partner NGOs", Building2],
    ["Survey projects", ShieldCheck],
    ["Verification", ShieldCheck],
    ...(surveyManage ? [["Project governance", ShieldCheck], ["Survey templates", ShieldCheck], ["Canonical registry", ShieldCheck], ["Beneficiary cases", HeartHandshake], ["Assistance ledger", HeartHandshake], ["Data sharing", Share2], ["Workforce marketplace", Users]] : []),
    ...(financeManage ? [["Project funding", Activity], ["Withdrawal operations", CreditCard], ["E-Wallet sandbox", CreditCard]] : []),
    ...(poem && ["admin", "super_admin"].includes(account.platform_role) ? [["Memberships", Users]] : []),
    ...(superAdmin ? [["Accounts", KeyRound]] : []),
    ...(ngos ? [["Geography", MapPin]] : []),
    ["Notifications", Bell],
    ["Activity", Activity],
  ] as unknown as readonly (readonly [string, typeof LayoutDashboard])[]);
  const nav = projectScope
    ? ([
        ["Project workspace", LayoutDashboard],
        ["Survey projects", ShieldCheck],
        ...(projectScopeAssignment?.role === "project_manager" ? [["Recruitment", Users], ["Beneficiary cases", HeartHandshake], ["Assistance ledger", HeartHandshake]] : []),
        ["Notifications", Bell],
        ["Activity", Activity],
      ] as unknown as readonly (readonly [string, typeof LayoutDashboard])[])
    : organizationWorkspace
      ? organizationNav
      : poem
        ? staffNav
        : standardNav;
  const change = (p: string) => {
    setPage(p);
    setQuery("");
    setFilter("all");
    setMenu(false);
    setSelected(null);
    setOrgEdit(null);
  };
  const currentWorkspaceLabel = poem
    ? workspaceLabels.staff
    : scope === "personal"
      ? workspaceLabels.personal
      : projectScope
        ? `${projectScopeProject?.title || "Project"} · ${workspaceLabels.project}`
        : `${myOrgs.find((o) => o.id === scope)?.name || "Organization"} · ${workspaceLabels.organization}`;
  const personalWorkspace = !poem && scope === "personal";
  const displayPage = poem ? staffPageLabel(page) : organizationWorkspace ? organizationPageLabel(page) : workspacePageLabel(page, personalWorkspace);
  const unreadNotifications = notifications.filter((n) => !n.read_at).length;
  const pageEyebrow = page === "Partner NGO application"
    ? "ORGANIZATION ONBOARDING"
    : personalWorkspace
      ? page === "Overview" ? "FIELD WORKER WORKSPACE" : "FIELD WORKER"
      : organizationWorkspace
        ? page === "Overview" ? "ORGANIZATION WORKSPACE" : "ORGANIZATION OPERATIONS"
        : poem
          ? page === "Overview" ? "FIELDLANCE STAFF OPERATIONS" : "FIELDLANCE OPERATIONS"
          : "PEOPLE AT THE HEART OF IMPACT";
  const pageTitle = page === "Overview"
    ? poem
      ? "Keep the FieldLance network accountable."
      : scope === "personal"
        ? "Your next opportunity starts here."
        : projectScope
          ? projectScopeProject?.title || "Project workspace"
          : "Build the field team your project needs."
    : displayPage;
  const pageDescription = page === "Partner NGO application"
    ? "Create and submit your organization profile for FieldLance review. Your Field Worker account remains separate."
    : poem
      ? "Review priority queues, govern access and coordinate trusted operations across the FieldLance network."
      : scope === "personal"
        ? "Find field work, build verified experience and grow your earnings."
        : projectScope
          ? `${human(projectScopeAssignment?.role || "project_staff")} · project-scoped operations and field delivery.`
          : "Manage projects, recruitment, field workers and delivery from one accountable organization workspace.";
  if (loading)
    return (
      <div className="setup" role="status">
        Loading your workspace…
      </div>
    );
  if (!account)
    return (
      <div className="setup">
        <h2>Unable to open your account</h2>
        <p role="alert">
          {error ||
            "Account setup is incomplete. Check that database migrations have been applied."}
        </p>
        <button className="primary" onClick={load}>
          Retry
        </button>
        <button onClick={logout}>Sign out</button>
      </div>
    );
  if (account.status === "suspended")
    return (
      <div className="setup">
        <ShieldCheck size={40} />
        <h1>Account suspended</h1>
        <p>Contact FieldLance to request a review. Data access has been disabled.</p>
        <button onClick={logout}>Sign out</button>
      </div>
    );
  return (
    <div className="app" onKeyDown={e=>{if(e.key==='Escape'&&menu){setMenu(false);requestAnimationFrame(()=>document.getElementById('navigation-toggle')?.focus())}}}>
      <a className="skip-link" href="#workspace-content">Skip to content</a>
      {menu&&<button className="nav-backdrop" aria-label="Close navigation" onClick={()=>{setMenu(false);requestAnimationFrame(()=>document.getElementById('navigation-toggle')?.focus())}}/>}
      <aside id="workspace-navigation" aria-label="Workspace navigation" className={menu ? "sidebar open" : "sidebar"}>
        <button className="drawer-close" onClick={()=>{setMenu(false);requestAnimationFrame(()=>document.getElementById('navigation-toggle')?.focus())}}>Close navigation ×</button>
        <FieldLanceBrand variant="wordmark" />
        <div className="workspace-select">
          <label htmlFor="scope">WORKSPACE</label>
          <select
            id="scope"
            value={scope}
            onChange={(e) => {
              const next = e.target.value;
              setScope(next);
              change(next.startsWith("project:") ? "Project workspace" : "Overview");
            }}
          >
            {admin && <option value="poem">{workspaceLabels.staff}</option>}
            <option value="personal">{workspaceLabels.personal}</option>
            {myOrgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} — {workspaceLabels.organization}
              </option>
            ))}
            {staffProjects.map((p) => {
              const assignment = projectStaff.find((s) => s.project_id === p.id);
              return (
                <option key={`project:${p.id}`} value={`project:${p.id}`}>
                  {p.title} — {human(assignment?.role || "project_staff")}
                </option>
              );
            })}
          </select>
        </div>
        <nav aria-label="Main navigation">
          {navigationGroups.map(group=>{const items=nav.filter(([name])=>group.pages.includes(name));return items.length?<div className="nav-section" key={group.label}><span className="nav-section-label">{group.label}</span>{items.map(([name, Icon]) => (
            <button
              key={name}
              aria-current={page === name ? "page" : undefined}
              className={page === name ? "active" : ""}
              onClick={() => change(name)}
            >
              <Icon size={19} />
              {poem ? staffPageLabel(name) : organizationWorkspace ? organizationPageLabel(name) : workspacePageLabel(name, personalWorkspace)}
              {name === "Notifications" &&
                notifications.some((n) => !n.read_at) && (
                  <span className="nav-count">
                    {notifications.filter((n) => !n.read_at).length}
                  </span>
                )}
            </button>
          ))}</div>:null})}
        </nav>
        <div className="trust">
          <ShieldCheck />
          <strong>A network built on trust.</strong>
          <p>Your information. Clear permissions. Accountable decisions.</p>
        </div>
        <div className="identity">
          <span className="avatar">
            {(account.full_name || account.email)[0].toUpperCase()}
          </span>
          <div>
            <strong>{account.full_name || "FieldLance member"}</strong>
            <small>{human(account.platform_role)}</small>
          </div>
        </div>
        <button className="logout" onClick={logout}>
          <LogOut size={17} />
          Sign out
        </button>
      </aside>
      <main id="workspace-main">
        <header>
          <button
            className="mobile-toggle"
            id="navigation-toggle"
            aria-controls="workspace-navigation"
            aria-expanded={menu}
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="header-context">
            <strong>{displayPage}</strong>
            <span>{currentWorkspaceLabel}</span>
          </div>
          <div className="header-tools">
            <button type="button" className="header-icon-button" aria-label={unreadNotifications ? `Notifications, ${unreadNotifications} unread` : "Notifications"} onClick={()=>change("Notifications")}>
              <Bell size={18}/>{unreadNotifications>0&&<span className="header-notification-count">{unreadNotifications}</span>}
            </button>
            <button type="button" className="secondary header-offline-action" onClick={openField}>Offline field</button>
            <SurveySyncStatus userId={session.user.id} />
            <span className="release">v{APP_VERSION}</span>
          </div>
        </header>
        <div className="content" id="workspace-content" tabIndex={-1}>
          <div className="heading">
            <div>
              <span className="eyebrow">{pageEyebrow}</span>
              <h1>{pageTitle}</h1>
              <p>{pageDescription}</p>
            </div>
            {page === "Partner NGOs" && ngos && (
              <button
                className="primary"
                onClick={() => setOrgEdit({ name: "", status: "pending" })}
              >
                <Plus size={17} />
                Add partner NGO
              </button>
            )}
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={load}>Reload</button>
            </div>
          )}
          {notice && (
            <div className="notice success" role="status">
              {notice}
              <button onClick={() => setNotice("")} aria-label="Dismiss">
                ×
              </button>
            </div>
          )}
          {!validScope && (
            <div className="notice error">
              This workspace is no longer available. Switch to your personal
              workspace.
            </div>
          )}
          {page === "Overview" && (
            <>
              {personalWorkspace ? (
                <FieldWorkerDashboard
                  userId={session.user.id}
                  profile={(my as Database['public']['Tables']['volunteer_profiles']['Row'] | null) || null}
                  unread={unreadNotifications}
                  onNavigate={change}
                  onField={openField}
                />
              ) : organizationWorkspace ? (
                <OrganizationDashboard
                  organization={myOrgs.find((item) => item.id === scope) as Database['public']['Tables']['organizations']['Row']}
                  unread={unreadNotifications}
                  onNavigate={change}
                />
              ) : poem ? (
                <FieldLanceStaffDashboard
                  platformRole={account.platform_role}
                  unread={unreadNotifications}
                  canReviewFieldWorkers={Boolean(volunteers)}
                  canReviewOrganizations={Boolean(ngos)}
                  canManageSurveys={surveyManage}
                  canManageFinance={financeManage}
                  superAdmin={Boolean(superAdmin)}
                  onNavigate={change}
                />
              ) : (
                <WorkflowOverview staff={false} personal={false} profileStatus={my?.status === "verified" ? "Active" : human(my?.status || "draft")} unread={unreadNotifications} allowed={nav.map(([name])=>name)} onNavigate={change} onField={openField}/>
              )}
              <section className="panel">
                <div className="panel-title">
                  <h2>Recent activity</h2>
                  <button className="link" onClick={() => change("Activity")}>
                    View activity
                  </button>
                </div>
                <EventList events={events.slice(0, 4)} />
              </section>
            </>
          )}
          {page === "My profile" && my && (
            <ProfileForm
              key={my.version}
              profile={my}
              geographies={geographies}
              busy={busy}
              saveDraft={(details, geography) =>
                act(
                  () =>
                    rpc("save_my_profile", {
                      p_details: details,
                      p_submit: false,
                      p_version: my.version,
                      p_geography: geography,
                    }),
                  "Draft saved.",
                )
              }
              publish={(details, geography) =>
                act(
                  () =>
                    rpc("publish_my_profile", {
                      p_details: details,
                      p_version: my.version,
                      p_geography: geography,
                    }),
                  my.status === "draft" ? "Profile published." : "Profile changes saved.",
                )
              }
              onPhotoChanged={load}
            />
          )}
          {page === "Volunteers" &&
            validScope &&
            (volunteers || (!poem && scope !== "personal")) && (
              <>
                <Directory
                  key={scope + page}
                  organization={poem ? null : scope}
                  geographies={geographies}
                  reviewQueue={false}
                  onSelect={setSelected}
                  revision={revision}
                />
                {selected && (
                  <section className="panel detail">
                    <div className="panel-title">
                      <h2>
                        {selected.details.full_name || "Volunteer profile"}
                      </h2>
                      <button
                        onClick={() => setSelected(null)}
                        aria-label="Close profile"
                      >
                        Close ×
                      </button>
                    </div>
                    <ProfilePhoto
                      userId={selected.user_id}
                      name={(selected.details as Record<string, string>).full_name || "Volunteer"}
                      photoPath={selected.photo_path || null}
                      photoUpdatedAt={selected.photo_updated_at || null}
                    />
                    <ProfileDetailsView
                      details={selected.details as Record<string, unknown>}
                      geographies={geographies}
                    />
                    <ExperiencePanel
                      key={selected.user_id}
                      userId={selected.user_id}
                      organization={null}
                      orgs={orgs as any}
                      readonly
                    />
                    {volunteers && selected.user_id !== session.user.id && (
                      <>
                        <Documents
                          userId={selected.user_id}
                          owner={false}
                          reviewer={true}
                          onChanged={async () => {
                            await load();
                            const r = await db!
                              .from("volunteer_profiles")
                              .select("*")
                              .eq("user_id", selected.user_id)
                              .single();
                            if (r.error) throw r.error;
                            setSelected(r.data);
                          }}
                        />
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          {page === "Partner NGO application" && !poem && scope === "personal" && validScope && (
            <PartnerNgoApplication
              userId={session.user.id}
              geographies={geographies}
              accountName={account.full_name || ""}
              accountEmail={account.email || ""}
              onChanged={load}
              onOpenOrganization={(organizationId) => {
                setScope(organizationId);
                change("Overview");
              }}
              onBackToDashboard={() => change("Overview")}
            />
          )}
          {page === "NGO applications" && ngos && validScope && (
            <PartnerNgoApplicationsReview geographies={geographies} onChanged={load} />
          )}
          {page === "Partner NGOs" && (
            <>
              {orgEdit && ngos && (
                <OrgForm
                  value={orgEdit}
                  busy={busy}
                  cancel={() => setOrgEdit(null)}
                  save={async (d) => {
                    if (
                      await act(
                        () =>
                          rpc("save_organization", {
                            p_id: orgEdit.id || null,
                            p_data: d,
                          }),
                        "Organization saved.",
                      )
                    )
                      setOrgEdit(null);
                  }}
                />
              )}
              <div className="org-grid">
                {orgs.map((o) => (
                  <section className="panel org" key={o.id}>
                    <div className="org-card-heading">
                      <OrganizationLogoImage name={o.name} path={o.logo_path || null} updatedAt={o.logo_updated_at || null} size="card" />
                      <div><h2>{o.name}</h2><small>{o.registration_number || "Partner organization"}</small></div>
                    </div>
                    <Badge value={o.status} />
                    <p>{o.programs || "Programs not yet specified"}</p>
                    <dl>
                      <dt>Areas</dt>
                      <dd>{o.areas || "—"}</dd>
                      <dt>Contact</dt>
                      <dd>{o.contact_person || "—"}</dd>
                      <dt>Email</dt>
                      <dd>{o.email || "—"}</dd>
                      <dt>Registration</dt>
                      <dd>{o.registration_number || "—"}</dd>
                    </dl>
                    {ngos && (
                      <button
                        className="secondary"
                        onClick={() => setOrgEdit(o)}
                      >
                        Edit organization
                      </button>
                    )}
                    <NgoOperations
                      orgId={o.id}
                      geographies={geographies}
                      editable={Boolean(ngos)}
                    />
                  </section>
                ))}
              </div>
              {!orgs.length && (
                <div className="panel empty">
                  <Building2 />
                  <h3>No organizations yet</h3>
                </div>
              )}
            </>
          )}
          {page === "Memberships" &&
            poem &&
            ["admin", "super_admin"].includes(account.platform_role) && (
              <section className="panel detail">
                <h2>Organization memberships</h2>
                <p>
                  Assign an existing registered account to an NGO. Membership
                  does not automatically share the volunteer’s profile. To replace an NGO admin, assign the new admin first, then remove the previous membership access below. Removal suspends the membership and keeps its history. Separate survey assignments and platform roles are unchanged.
                </p>
                <MembershipForm
                  orgs={orgs}
                  accounts={accounts}
                  busy={busy}
                  save={(org, user, role, status) =>
                    act(
                      () =>
                        rpc("set_membership", {
                          p_org: org,
                          p_user: user,
                          p_role: role,
                          p_status: status,
                        }),
                      "Membership updated.",
                    )
                  }
                />
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Organization</th>
                        <th>Account</th>
                        <th>Role</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.organization_id + m.user_id}>
                          <td>
                            {orgs.find((o) => o.id === m.organization_id)?.name}
                          </td>
                          <td>
                            {accounts.find((a) => a.id === m.user_id)?.email}
                          </td>
                          <td>{human(m.role)}</td>
                          <td>
                            <Badge value={m.status} />
                          </td>
                          <td><MembershipActions key={`${m.organization_id}:${m.user_id}:${m.role}:${m.status}`} role={m.role} status={m.status} label={`${accounts.find(a=>a.id===m.user_id)?.email||m.user_id} at ${orgs.find(o=>o.id===m.organization_id)?.name||m.organization_id}`} busy={busy} save={(role,status)=>act(()=>rpc('set_membership',{p_org:m.organization_id,p_user:m.user_id,p_role:role,p_status:status}),'Membership updated. Separate project assignments and platform roles are unchanged.')}/></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          {page === "Accounts" && superAdmin && (
            <section className="panel detail">
              <h2>Platform access</h2>
              <p>
                Platform roles are separate from NGO memberships. Suspend an
                account to stop its database access immediately.
              </p>
              {accounts
                .filter((a) => a.id !== session.user.id)
                .map((a) => (
                  <AccountAccess
                    key={a.id + a.platform_role + a.status}
                    account={a}
                    busy={busy}
                    save={(role, status) =>
                      act(
                        () =>
                          rpc("set_account_access", {
                            p_user: a.id,
                            p_role: role,
                            p_status: status,
                          }),
                        "Account access updated.",
                      )
                    }
                  />
                ))}
            </section>
          )}
          {page === "Geography" && ngos && (
            <GeographyManager rows={geographies} refresh={load} />
          )}
          {page === "Workforce payables" && !poem && validScope && <Suspense fallback={<p role="status">Loading payables…</p>}><PayablesWorkspace key={scope} userId={session.user.id} organization={scope==='personal'?null:scope}/></Suspense>}
          {page === "E-Wallets & withdrawals" && !poem && scope === "personal" && validScope && <Suspense fallback={<p role="status">Loading e-wallets and withdrawals…</p>}><EWalletWithdrawalWorkspace key={`wallet-${session.user.id}`}/></Suspense>}
          {page === "Withdrawal operations" && financeManage && validScope && <Suspense fallback={<p role="status">Loading withdrawal operations…</p>}><WithdrawalOperationsWorkspace/></Suspense>}
          {page === "E-Wallet sandbox" && financeManage && validScope && <Suspense fallback={<p role="status">Loading mock e-wallet sandbox…</p>}><MockEWalletSandbox/></Suspense>}
          {page === "Project funding" && validScope && (financeManage || (!poem && scope !== "personal" && !projectScope)) && <Suspense fallback={<p role="status">Loading project funding…</p>}><ProjectFundingWorkspace key={`funding-${scope}`} organization={financeManage?null:scope} platform={financeManage} orgs={orgs as any}/></Suspense>}
          {(["Workforce marketplace", "Available Opportunities", "My Applications", "My Assigned Surveys", "Recruitment"].includes(page)) && validScope && (surveyManage || !poem) && (
            <WorkforceMarketplace
              key={`${scope}-${page}`}
              userId={session.user.id}
              organization={poem || scope === "personal" ? null : projectScope ? (projectScopeProject?.organization_id || null) : scope}
              mode={poem ? "poem" : scope === "personal" ? "personal" : projectScope ? "project" : "ngo"}
              projectScopeId={projectScopeId}
              personalView={page === "Available Opportunities" ? "opportunities" : page === "My Applications" ? "applications" : page === "My Assigned Surveys" ? "assigned" : "all"}
              geographies={geographies}
              orgs={orgs as any}
            />
          )}
          {page === "Private documents" && !poem && validScope && (
            <Documents
              userId={session.user.id}
              owner={true}
              reviewer={false}
              onChanged={load}
            />
          )}
          {page === "Work experience" && !poem && validScope && (
            <ExperiencePanel
              key={scope}
              userId={session.user.id}
              organization={scope === "personal" ? null : scope}
              orgs={orgs as any}
            />
          )}
          {page === "Invitations" && !poem && validScope && (
            <InvitationsPanel
              key={scope}
              userId={session.user.id}
              organization={scope === "personal" ? null : scope}
              orgs={orgs as any}
              geographies={geographies}
            />
          )}
          {page === "Survey templates" && validScope && (surveyManage || (!poem && scope !== "personal" && !projectScope)) && (
            <Suspense fallback={<p role="status">Loading templates…</p>}>
              <SurveyTemplates manage={surveyManage} organization={surveyManage ? null : scope} />
            </Suspense>
          )}
          {page === "Project team" && !poem && scope !== "personal" && !projectScope && validScope && (
            <ProjectTeamWorkspace
              key={`team-${scope}-${revision}`}
              userId={session.user.id}
              organization={scope}
              geographies={geographies}
              canManageTeam={true}
            />
          )}
          {page === "Project workspace" && projectScopeId && validScope && (
            <ProjectTeamWorkspace
              key={`project-${projectScopeId}-${revision}`}
              userId={session.user.id}
              organization={null}
              projectId={projectScopeId}
              geographies={geographies}
              canManageTeam={false}
              openOperations={() => change("Survey projects")}
              openNotifications={() => change("Notifications")}
            />
          )}
          {page === "Survey projects" && validScope && (
            <Suspense fallback={<p role="status">Loading surveys…</p>}>
              <SurveyProjects
                key={scope}
                userId={session.user.id}
                organization={scope === "personal" || poem || projectScope ? null : scope}
                projectId={projectScopeId}
                manage={surveyManage}
                review={surveyManage || projectScope || (!poem && scope !== "personal")}
                manageAssignments={canManageProjectAssignments}
                orgs={orgs as any}
                geographies={geographies}
                openRecruitment={canManageProjectAssignments ? () => change(projectScope ? "Recruitment" : "Workforce marketplace") : undefined}
                onBackToWorkspace={projectScope ? () => change("Project workspace") : undefined}
              />
            </Suspense>
          )}
          {page === "Verification" && validScope && <Suspense fallback={<p>Loading verification…</p>}><VerificationWorkspace key={session.user.id+scope} userId={session.user.id} managers={{organization:Boolean(ngos),volunteer:Boolean(volunteers),beneficiary:surveyManage}}/></Suspense>}
          {page === "Project governance" && validScope && (surveyManage || (!poem && scope !== "personal")) && <Suspense fallback={<p>Loading governance…</p>}><ProjectGovernance key={scope} manage={surveyManage} organization={poem?null:scope}/></Suspense>}
          {page === "Canonical registry" && validScope && surveyManage && (
            <Suspense fallback={<p>Loading canonical registry…</p>}><CanonicalWorkbench /></Suspense>
          )}
          {page === "Beneficiary cases" && validScope && (surveyManage || (!poem && scope !== "personal" && (!projectScope || projectScopeAssignment?.role === "project_manager"))) && (
            <Suspense fallback={<p role="status">Loading beneficiary cases…</p>}><BeneficiaryCasesWorkspace key={`cases-${scope}-${projectScopeId||"all"}`} organization={poem||projectScope?null:scope} projectId={projectScopeId}/></Suspense>
          )}
          {page === "Assistance ledger" && validScope && (surveyManage || (!poem && scope !== "personal" && (!projectScope || projectScopeAssignment?.role === "project_manager"))) && (
            <Suspense fallback={<p role="status">Loading assistance ledger…</p>}><AssistanceLedgerWorkspace key={`assistance-ledger-${scope}-${projectScopeId||"all"}`} organization={poem||projectScope?null:scope} projectId={projectScopeId}/></Suspense>
          )}
          {page === "Data sharing" && validScope && (surveyManage || (!poem && scope !== "personal")) && (
            <DataSharingWorkspace
              key={scope}
              organization={poem || scope === "personal" ? null : scope}
              manage={surveyManage}
              orgs={orgs as any}
            />
          )}
          {page === "Notifications" && (
            <Notifications rows={notifications} refresh={load} />
          )}
          {page === "Activity" && (
            <section className="panel">
              <div className="panel-title">
                <h2>Audit history</h2>
                <span>Latest 100 authorized events</span>
              </div>
              <EventList events={events} />
            </section>
          )}
          <footer>
            <span>FieldLance · Field work marketplace</span>
            <span>FieldLance {APP_VERSION} · Survey and registry operations.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
