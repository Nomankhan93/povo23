import { useEffect, useState } from "react";
import { db, rpc } from "../../lib/supabase/client";

function photoType(file: File) {
  if (file.size < 1 || file.size > 2097152) throw Error("Choose a JPG or PNG image up to 2 MiB.");
  return file.slice(0, 8).arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    const type =
      bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10
          ? "image/png"
          : null;
    if (!type) throw Error("Choose a valid JPG or PNG image.");
    return type;
  });
}

export function ProfilePhoto({
  userId,
  name,
  photoPath,
  photoUpdatedAt,
  owner = false,
  onChanged,
}: {
  userId: string;
  name: string;
  photoPath: string | null;
  photoUpdatedAt?: string | null;
  owner?: boolean;
  onChanged?: () => Promise<void>;
}) {
  const [url, setUrl] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setError("");
    setUrl(null);
    if (!photoPath) return () => {};
    db!.storage
      .from("poem-profile-photos")
      .download(photoPath)
      .then((result) => {
        if (!alive) return;
        if (result.error) {
          setError("Profile photo is unavailable.");
          return;
        }
        objectUrl = URL.createObjectURL(result.data);
        setUrl(objectUrl);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoPath, photoUpdatedAt]);

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const type = await photoType(file);
      const path = `${userId}/profile`;
      const uploaded = await db!.storage.from("poem-profile-photos").upload(path, file, {
        contentType: type,
        cacheControl: "0",
        upsert: true,
      });
      if (uploaded.error) throw uploaded.error;
      await rpc("set_profile_photo", { p_present: true });
      await onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!photoPath || !window.confirm("Remove your profile photo?")) return;
    setBusy(true);
    setError("");
    try {
      const removed = await db!.storage.from("poem-profile-photos").remove([photoPath]);
      if (removed.error) throw removed.error;
      await rpc("set_profile_photo", { p_present: false });
      await onChanged?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "V";

  return (
    <div className="profile-photo-block">
      <div className="profile-photo-frame" aria-label={`${name || "Volunteer"} profile photo`}>
        {url ? <img src={url} alt={`${name || "Volunteer"} profile`} /> : <span>{initials}</span>}
      </div>
      {owner && (
        <div className="profile-photo-actions">
          <label className="secondary photo-upload-button">
            {busy ? "Please wait…" : photoPath ? "Change photo" : "Upload photo"}
            <input
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {photoPath && (
            <button type="button" className="link" disabled={busy} onClick={() => void remove()}>
              Remove
            </button>
          )}
        </div>
      )}
      {error && <small className="photo-error">{error}</small>}
    </div>
  );
}
