import { Activity } from "lucide-react";
import { Row } from "../../shared/legacyTypes";
import { human } from "../../shared/ui/FormFields";
export function EventList({ events }: { events: Row[] }) {
  return events.length ? (
    <div>
      {events.map((e) => (
        <div className="event" key={e.id}>
          <Activity size={18} />
          <div>
            <strong>{human(e.action)}</strong>
            <p>
              {Object.entries(e.detail || {})
                .map(([k, v]) => `${human(k)}: ${v}`)
                .join(" · ")}
            </p>
            <small>
              {new Date(e.created_at).toLocaleString()} · Actor:{" "}
              {e.actor_id || "System"}
            </small>
          </div>
        </div>
      ))}
    </div>
  ) : (
    <div className="empty">
      <Activity />
      <h3>No activity yet</h3>
      <p>Profile updates and access decisions will appear here.</p>
    </div>
  );
}
