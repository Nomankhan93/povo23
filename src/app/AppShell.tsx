import type { Session } from "@supabase/supabase-js";
import {
  Activity,
  ArrowRight,
  Bell,
  Building2,
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
import { lazy, Suspense, useEffect, useState } from "react";
import { EventList } from "../features/audit/EventList";
import { AccountAccess } from "../features/auth/AccountAccess";
import { GeographyManager } from "../features/geography/GeographyManager";
import { type Geo } from "../features/geography/model";
import { Notifications } from "../features/notifications/Notifications";
import { DataSharingWorkspace } from "../features/sharing/DataSharingWorkspace";
import { MembershipForm } from "../features/organizations/MembershipForm";
import { NgoOperations } from "../features/organizations/NgoOperations";
import { OrgForm } from "../features/organizations/OrgForm";
import { APP_VERSION } from "./version";
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
import { SurveySyncStatus } from "../features/surveys/SurveySyncStatus";

import { Directory } from "../features/volunteers/Directory";
import { Documents } from "../features/volunteers/Documents";
import { ExperiencePanel } from "../features/volunteers/ExperiencePanel";
import { ProfileDetailsView } from "../features/volunteers/ProfileDetailsView";
import { ProfileForm } from "../features/volunteers/ProfileForm";
import { ProfilePhoto } from "../features/volunteers/ProfilePhoto";
import { InvitationsPanel } from "../features/workforce/InvitationsPanel";
import { WorkforceMarketplace } from "../features/workforce/WorkforceMarketplace";
import { db, rpc } from "../lib/supabase/client";
import { Row } from "../shared/legacyTypes";
import { Badge, human } from "../shared/ui/FormFields";
export function Workspace({ session }: { session: Session }) {
  const [account, setAccount] = useState<Row | null>(null),
    [profiles, setProfiles] = useState<Row[]>([]),
    [orgs, setOrgs] = useState<Row[]>([]),
    [members, setMembers] = useState<Row[]>([]),
    [accounts, setAccounts] = useState<Row[]>([]),
    [shares, setShares] = useState<Row[]>([]),
    [events, setEvents] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [page, setPage] = useState("Overview"),
    [scope, setScope] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<Row | null>(null),
    [orgEdit, setOrgEdit] = useState<Row | null>(null),
    [menu, setMenu] = useState(false),
    [geographies, setGeographies] = useState<Geo[]>([]),
    [notifications, setNotifications] = useState<import('../lib/supabase/database.types').Database['public']['Tables']['notifications']['Row'][]>([]);
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
  const [revision, setRevision] = useState(0);
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
        db!.from("profile_shares").select("*").limit(1000),
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
        res[7].data!,
        ...(res[0].data || []).filter(
          (p: Row) => p.user_id !== session.user.id,
        ),
      ]);
      setOrgs(res[1].data || []);
      setMembers(res[2].data || []);
      setShares(res[3].data || []);
      setEvents(res[4].data || []);
      setAccounts(res[5].data || []);
      setNotifications(res[6].data || []);
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
      setScope(
        (old) =>
          old ||
          ([
            "admin",
            "super_admin",
            "volunteer_manager",
            "ngo_manager",
            "auditor",
            "survey_manager",
          ].includes(a.data.platform_role)
            ? "poem"
            : (res[2].data || []).find(
                (m) =>
                  m.user_id === session.user.id &&
                  m.role === "ngo_admin" &&
                  m.status === "active" &&
                  (res[1].data || []).some(
                    (o) => o.id === m.organization_id && o.status === "active",
                  ),
              )?.organization_id || "personal"),
      );
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
    const { error } = await db!.auth.signOut();
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
  const validScope =
    poem || scope === "personal" || myOrgs.some((o) => o.id === scope);
  const nav = [
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
    ["Partner NGOs", Building2],
    ["Survey projects", ShieldCheck],
    ...(surveyManage ? [["Survey templates", ShieldCheck]] : []),
    ...(surveyManage || (!poem && scope !== "personal") ? [["Data sharing", Share2]] : []),
    ...(surveyManage || !poem ? [["Workforce marketplace", Users]] : []),
    ...(!poem ? [["Invitations", Bell]] : []),
    ...(poem && ["admin", "super_admin"].includes(account.platform_role)
      ? [["Memberships", Users]]
      : []),
    ...(superAdmin ? [["Accounts", KeyRound]] : []),
    ...(ngos ? [["Geography", MapPin]] : []),
    ["Notifications", Bell],
    ["Activity", Activity],
  ] as const;
  const change = (p: string) => {
    setPage(p);
    setQuery("");
    setFilter("all");
    setMenu(false);
    setSelected(null);
    setOrgEdit(null);
  };
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
        <p>Contact POEM to request a review. Data access has been disabled.</p>
        <button onClick={logout}>Sign out</button>
      </div>
    );
  return (
    <div className="app">
      <aside className={menu ? "sidebar open" : "sidebar"}>
        <div className="logo">
          <HeartHandshake />
          <b>POEM</b>
        </div>
        <div className="workspace-select">
          <label htmlFor="scope">WORKSPACE</label>
          <select
            id="scope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              change("Overview");
            }}
          >
            {admin && <option value="poem">POEM administration</option>}
            <option value="personal">My volunteer workspace</option>
            {myOrgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        <nav>
          {nav.map(([name, Icon]: any) => (
            <button
              key={name}
              className={page === name ? "active" : ""}
              onClick={() => change(name)}
            >
              <Icon size={19} />
              {name}
              {name === "Notifications" &&
                notifications.some((n) => !n.read_at) && (
                  <span className="nav-count">
                    {notifications.filter((n) => !n.read_at).length}
                  </span>
                )}
            </button>
          ))}
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
            <strong>{account.full_name || "POEM member"}</strong>
            <small>{human(account.platform_role)}</small>
          </div>
        </div>
        <button className="logout" onClick={logout}>
          <LogOut size={17} />
          Sign out
        </button>
      </aside>
      <main>
        <header>
          <button
            className="mobile-toggle"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <span>
            Workspace <b>/</b> {page}
          </span>
          <div className="header-tools">
            <SurveySyncStatus userId={session.user.id} />
            <span className="release">POEM {APP_VERSION}</span>
          </div>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <span className="eyebrow">PEOPLE AT THE HEART OF IMPACT</span>
              <h1>
                {page === "Overview" ? "Your community, connected." : page}
              </h1>
              <p>
                {poem
                  ? "Manage the network, review profiles and support your partner NGOs."
                  : scope === "personal"
                    ? "Build your profile and choose who can access it."
                    : "View volunteers who have shared their profiles with your NGO."}
              </p>
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
              <section className="panel detail">
                <h2>
                  {poem
                    ? "POEM staff workspace"
                    : scope === "personal"
                      ? "Your volunteer workspace"
                      : "NGO workforce workspace"}
                </h2>
                <p>
                  {poem
                    ? "Your staff role determines which records and actions are available."
                    : scope === "personal"
                      ? "Keep your profile and sharing preferences current."
                      : "Search shared volunteers and manage your NGO shortlist."}
                </p>
                {(volunteers || (!poem && scope !== "personal")) && (
                  <button
                    className="primary"
                    onClick={() => change("Volunteers")}
                  >
                    Search volunteers
                  </button>
                )}
              </section>
              <div className="overview-grid">
                <section className="hero-panel">
                  <span className="eyebrow">THE NEXT STEP STARTS WITH YOU</span>
                  <h2>
                    Local people.
                    <br />
                    Lasting possibilities.
                  </h2>
                  <p>
                    Keep your information up to date and turn your experience
                    into meaningful community work.
                  </p>
                  <button onClick={() => change("My profile")}>
                    Complete your profile <ArrowRight size={17} />
                  </button>
                </section>
                <section className="panel attention">
                  <ShieldCheck size={32} />
                  <h2>{volunteers ? "Volunteer network" : "Your profile status"}</h2>
                  {volunteers ? (
                    <>
                      <p>Profiles publish directly. Use the volunteer directory to support volunteers and review private documents when needed.</p>
                      <button onClick={() => change("Volunteers")}>
                        Open volunteer directory <ArrowRight size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className={"badge " + (my?.status || "draft")}>
                        {my?.status === "verified" ? "Active" : human(my?.status || "draft")}
                      </span>
                      <p>Published profile changes go live immediately. Admin approval is not required.</p>
                      <button onClick={() => change("My profile")}>
                        View my profile <ArrowRight size={16} />
                      </button>
                    </>
                  )}
                </section>
              </div>
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
            <>
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
              <section className="panel sharing">
                <h2>NGO profile access</h2>
                <p>
                  Documents remain private to you and POEM. Allow an active
                  NGO’s administrators to view your full volunteer profile,
                  including phone, education, structured skills/languages, references and preferred work areas. NGO-confirmed work experience is shown separately. This is
                  optional and does not require POEM profile approval. Revocation
                  stops future platform access; it cannot recall information
                  already viewed.
                </p>
                {orgs
                  .filter(
                    (o) =>
                      o.status === "active" ||
                      shares.some(
                        (s) =>
                          s.organization_id === o.id &&
                          s.user_id === session.user.id,
                      ),
                  )
                  .map((o) => {
                    const granted = shares.some(
                      (s) =>
                        s.user_id === session.user.id &&
                        s.organization_id === o.id,
                    );
                    return (
                      <div className="share-row" key={o.id}>
                        <span>
                          {o.name} <Badge value={o.status} />
                        </span>
                        <button
                          disabled={busy}
                          className={granted ? "secondary" : "primary"}
                          onClick={() =>
                            act(
                              () =>
                                rpc("set_profile_sharing", {
                                  p_org: o.id,
                                  p_allowed: !granted,
                                }),
                              granted
                                ? "NGO access revoked."
                                : "Profile access granted to this NGO.",
                            )
                          }
                        >
                          {granted ? "Revoke access" : "Allow profile access"}
                        </button>
                      </div>
                    );
                  })}
                {!orgs.length && <p>No active partner NGOs yet.</p>}
              </section>
            </>
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
                    <Building2 size={26} />
                    <Badge value={o.status} />
                    <h2>{o.name}</h2>
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
                  does not automatically share the volunteer’s profile.
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
          {page === "Workforce marketplace" && validScope && (surveyManage || !poem) && (
            <WorkforceMarketplace
              key={scope}
              userId={session.user.id}
              organization={poem || scope === "personal" ? null : scope}
              mode={poem ? "poem" : scope === "personal" ? "personal" : "ngo"}
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
          {page === "Survey templates" && surveyManage && (
            <Suspense fallback={<p role="status">Loading templates…</p>}>
              <SurveyTemplates />
            </Suspense>
          )}
          {page === "Survey projects" && validScope && (
            <Suspense fallback={<p role="status">Loading surveys…</p>}>
              <SurveyProjects
                key={scope}
                userId={session.user.id}
                organization={scope === "personal" || poem ? null : scope}
                manage={surveyManage}
                review={surveyManage || (!poem && scope !== "personal")}
                orgs={orgs as any}
                geographies={geographies}
              />
            </Suspense>
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
            <span>POEM · Volunteer Network</span>
            <span>POEM {APP_VERSION} · Survey and registry operations.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
