import { useEffect, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { db, rpc } from "../../lib/supabase/client";

async function organizationLogoType(file: File) {
  if (file.size < 1 || file.size > 2097152) {
    throw Error("Choose a JPG, PNG or WebP organization logo up to 2 MiB.");
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10;
  const webp = bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70 && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80;
  if (jpeg) return "image/jpeg";
  if (png) return "image/png";
  if (webp) return "image/webp";
  throw Error("Choose a valid JPG, PNG or WebP image.");
}

export function OrganizationLogoImage({
  name,
  path,
  updatedAt,
  size = "card",
}: {
  name: string;
  path?: string | null;
  updatedAt?: string | null;
  size?: "card" | "application" | "review";
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setUrl(null);
    if (!path) return () => {};
    db!.storage
      .from("fieldlance-organization-logos")
      .download(path)
      .then((result) => {
        if (!alive || result.error) return;
        objectUrl = URL.createObjectURL(result.data);
        setUrl(objectUrl);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, updatedAt]);

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "NGO";

  return (
    <div className={`organization-logo organization-logo-${size}`} aria-label={`${name || "Organization"} logo`}>
      {url ? <img src={url} alt={`${name || "Organization"} logo`} /> : <span>{initials}</span>}
    </div>
  );
}

export function PartnerNgoLogoEditor({
  applicationId,
  name,
  path,
  updatedAt,
  editable,
  onChanged,
}: {
  applicationId: string;
  name: string;
  path?: string | null;
  updatedAt?: string | null;
  editable: boolean;
  onChanged: (path: string, updatedAt: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const objectPath = `${applicationId}/logo`;

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const type = await organizationLogoType(file);
      const uploaded = await db!.storage.from("fieldlance-organization-logos").upload(objectPath, file, {
        contentType: type,
        cacheControl: "0",
        upsert: true,
      });
      if (uploaded.error) throw uploaded.error;
      await rpc("set_partner_ngo_application_logo", { p_application: applicationId, p_present: true });
      onChanged(objectPath, new Date().toISOString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!path || !window.confirm("Remove this organization logo?")) return;
    setBusy(true);
    setError("");
    try {
      const removed = await db!.storage.from("fieldlance-organization-logos").remove([objectPath]);
      if (removed.error) throw removed.error;
      await rpc("set_partner_ngo_application_logo", { p_application: applicationId, p_present: false });
      onChanged("", new Date().toISOString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="organization-logo-editor">
      <OrganizationLogoImage name={name} path={path} updatedAt={updatedAt} size="application" />
      <div className="organization-logo-copy">
        <strong>Organization logo</strong>
        <p>Upload your organization&apos;s official logo. It will represent the organization after approval.</p>
        <small>JPG, PNG or WebP · maximum 2 MiB · square or near-square works best.</small>
        {editable && (
          <div className="organization-logo-actions">
            <label className="secondary organization-logo-upload">
              <ImagePlus size={16} />
              {busy ? "Please wait…" : path ? "Replace logo" : "Upload logo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {path && (
              <button type="button" className="link danger-link" disabled={busy} onClick={() => void remove()}>
                <Trash2 size={15} /> Remove
              </button>
            )}
          </div>
        )}
        {error && <small className="organization-logo-error" role="alert">{error}</small>}
      </div>
    </div>
  );
}
