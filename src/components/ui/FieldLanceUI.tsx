import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown, MoreHorizontal, X } from "lucide-react";
import { trapFocus } from "../system/focusManagement";
import { ActionDialog } from "./ActionDialog";

export type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger";

export function Button({ variant = "secondary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button {...props} className={`fl-button fl-button-${variant} ${className}`.trim()} />;
}

export function IconButton({ label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...props} aria-label={label} title={props.title || label} className={`fl-icon-button ${className}`.trim()} />;
}

export function PageHeader({ eyebrow, title, description, actions, id = "workspace-page-title", className = "" }: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
  className?: string;
}) {
  return <div className={`fl-page-header ${className}`.trim()}>
    <div className="fl-page-header-copy">
      {eyebrow && <span className="fl-eyebrow">{eyebrow}</span>}
      <h1 id={id}>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="fl-page-header-actions">{actions}</div>}
  </div>;
}

export function SectionHeader({ eyebrow, title, description, actions, className = "" }: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return <div className={`fl-section-header ${className}`.trim()}>
    <div>
      {eyebrow && <span className="fl-eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    {actions && <div className="fl-section-header-actions">{actions}</div>}
  </div>;
}

export function ActionMenu({ label = "More actions", children, className = "" }: { label?: string; children: ReactNode; className?: string }) {
  return <details className={`fl-action-menu ${className}`.trim()}>
    <summary aria-label={label} title={label}><MoreHorizontal size={18} /><span className="sr-only">{label}</span></summary>
    <div className="fl-action-menu-popover">{children}</div>
  </details>;
}

export function Field({ label, children, hint, error, required = false, className = "" }: {
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return <label className={`fl-field ${error ? "has-error" : ""} ${className}`.trim()}>
    <span className="fl-field-label">{label}{required && <span aria-hidden="true"> *</span>}</span>
    {children}
    {error ? <span className="fl-field-message fl-field-error" role="alert">{error}</span> : hint ? <span className="fl-field-message">{hint}</span> : null}
  </label>;
}

export function Select({ label, hint, error, options, className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  options?: readonly { value: string; label: string; disabled?: boolean }[];
}) {
  return <Field label={label} hint={hint} error={error} required={props.required}>
    <select {...props} className={`fl-control ${className}`.trim()} aria-invalid={Boolean(error) || undefined}>
      {options?.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
      {props.children}
    </select>
  </Field>;
}

export function Textarea({ label, hint, error, className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
}) {
  return <Field label={label} hint={hint} error={error} required={props.required}>
    <textarea {...props} className={`fl-control fl-textarea ${className}`.trim()} aria-invalid={Boolean(error) || undefined} />
  </Field>;
}

export function FieldGroup({ children, columns = 2, className = "", ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode; columns?: 1 | 2 }) {
  return <div {...props} className={`fl-field-group fl-field-group-${columns} ${className}`.trim()}>{children}</div>;
}

export function FormSection({ title, description, children, actions, className = "" }: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return <section className={`fl-form-section ${className}`.trim()}>
    <SectionHeader title={title} description={description} />
    <div className="fl-form-section-content">{children}</div>
    {actions && <div className="fl-form-section-actions">{actions}</div>}
  </section>;
}

export function FormActions({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`fl-form-actions ${className}`.trim()}>{children}</div>;
}

export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section {...props} className={`fl-card ${className}`.trim()}>{children}</section>;
}

export function MetricCard({ label, value, detail, className = "" }: { label: ReactNode; value: ReactNode; detail?: ReactNode; className?: string }) {
  return <Card className={`fl-metric-card ${className}`.trim()}>
    <span className="fl-metric-label">{label}</span><strong>{value}</strong>{detail && <span className="fl-metric-detail">{detail}</span>}
  </Card>;
}

export function EntityCard({ title, meta, status, children, actions, className = "" }: {
  title: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return <Card className={`fl-entity-card ${className}`.trim()}>
    <div className="fl-entity-card-heading"><div><h3>{title}</h3>{meta && <p>{meta}</p>}</div>{status}</div>
    {children && <div className="fl-entity-card-content">{children}</div>}
    {actions && <div className="fl-entity-card-actions">{actions}</div>}
  </Card>;
}

export type SemanticTone = "neutral" | "info" | "success" | "warning" | "danger";
export function StatusBadge({ children, tone = "neutral", className = "" }: { children: ReactNode; tone?: SemanticTone; className?: string }) {
  return <span className={`fl-status-badge fl-tone-${tone} ${className}`.trim()}><span className="fl-status-dot" aria-hidden="true" />{children}</span>;
}

export function Alert({ title, children, tone = "info", action, className = "" }: {
  title: ReactNode;
  children?: ReactNode;
  tone?: SemanticTone;
  action?: ReactNode;
  className?: string;
}) {
  return <div className={`fl-alert fl-tone-${tone} ${className}`.trim()} role={tone === "danger" ? "alert" : "status"}>
    <div><strong>{title}</strong>{children && <div className="fl-alert-copy">{children}</div>}</div>{action && <div className="fl-alert-action">{action}</div>}
  </div>;
}

export function SyncStatus({ state, pending = 0, label }: { state: "synced" | "pending" | "offline"; pending?: number; label?: string }) {
  const tone: SemanticTone = state === "synced" ? "success" : state === "pending" ? "warning" : "neutral";
  const text = label || (state === "synced" ? "Synced" : state === "pending" ? `${pending || 1} pending` : "Offline");
  return <StatusBadge tone={tone} className="fl-sync-status">{text}</StatusBadge>;
}

export function DataTable({ children, caption, className = "" }: { children: ReactNode; caption?: ReactNode; className?: string }) {
  return <div className={`fl-data-table-wrap ${className}`.trim()}><table className="fl-data-table">{caption && <caption>{caption}</caption>}{children}</table></div>;
}

export function MobileRecordCard({ title, status, meta, rows, action, className = "" }: {
  title: ReactNode;
  status?: ReactNode;
  meta?: ReactNode;
  rows?: readonly { label: ReactNode; value: ReactNode }[];
  action?: ReactNode;
  className?: string;
}) {
  return <article className={`fl-mobile-record ${className}`.trim()}>
    <div className="fl-mobile-record-heading"><strong>{title}</strong>{status}</div>
    {meta && <div className="fl-mobile-record-meta">{meta}</div>}
    {rows?.length ? <dl>{rows.map((row, index) => <div key={index}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : null}
    {action && <div className="fl-mobile-record-action">{action}</div>}
  </article>;
}

export function FilterBar({ children, actions, className = "" }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return <div className={`fl-filter-bar ${className}`.trim()}><div className="fl-filter-controls">{children}</div>{actions && <div className="fl-filter-actions">{actions}</div>}</div>;
}

export function Tabs<T extends string>({ items, activeId, onChange, label = "Sections", className = "" }: {
  items: readonly { id: T; label: ReactNode; disabled?: boolean }[];
  activeId: T;
  onChange: (id: T) => void;
  label?: string;
  className?: string;
}) {
  return <div className={`fl-tabs ${className}`.trim()} role="tablist" aria-label={label}>
    {items.map(item => <button key={item.id} type="button" role="tab" aria-selected={activeId === item.id} disabled={item.disabled} className={activeId === item.id ? "active" : ""} onClick={() => onChange(item.id)}>{item.label}</button>)}
  </div>;
}

export function SectionNav<T extends string>({ groups, activeId, onChange, label = "Section navigation", className = "" }: {
  groups: readonly { label: string; items: readonly { id: T; label: ReactNode; disabled?: boolean }[] }[];
  activeId: T;
  onChange: (id: T) => void;
  label?: string;
  className?: string;
}) {
  return <nav className={`fl-section-nav ${className}`.trim()} aria-label={label}>
    {groups.map(group => <div className="fl-section-nav-group" key={group.label}><span>{group.label}</span><div>{group.items.map(item => <button key={item.id} type="button" aria-current={activeId === item.id ? "page" : undefined} disabled={item.disabled} className={activeId === item.id ? "active" : ""} onClick={() => onChange(item.id)}>{item.label}</button>)}</div></div>)}
  </nav>;
}

export function MobileSectionPicker<T extends string>({ groups, activeId, onChange, label = "Section", disabled = false, className = "" }: {
  groups: readonly { label: string; items: readonly { id: T; label: string; disabled?: boolean }[] }[];
  activeId: T;
  onChange: (id: T) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return <label className={`fl-mobile-section-picker ${className}`.trim()}><span>{label}</span><div><select value={activeId} disabled={disabled} onChange={event => onChange(event.target.value as T)}>{groups.map(group => <optgroup key={group.label} label={group.label}>{group.items.map(item => <option key={item.id} value={item.id} disabled={item.disabled}>{item.label}</option>)}</optgroup>)}</select><ChevronDown size={17} aria-hidden="true" /></div></label>;
}

function useOverlayFocus(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => ref.current?.focus());
    return () => previous?.focus?.();
  }, [open]);
  return { ref, onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
    trapFocus(event, ref.current);
  }};
}

export function Dialog({ open, title, description, children, actions, onClose, className = "" }: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const focus = useOverlayFocus(open, onClose);
  if (!open) return null;
  return <div className="fl-dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={focus.ref} tabIndex={-1} onKeyDown={focus.onKeyDown} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={`fl-dialog ${className}`.trim()}>
      <div className="fl-dialog-heading"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><IconButton label="Close dialog" onClick={onClose}><X size={18} /></IconButton></div>
      {children && <div className="fl-dialog-content">{children}</div>}
      {actions && <div className="fl-dialog-actions">{actions}</div>}
    </section>
  </div>;
}

export function ConfirmDialog(props: { open: boolean; title: string; description?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; busy?: boolean; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  return <ActionDialog {...props} onConfirm={() => props.onConfirm()} />;
}

export function ReasonDialog(props: { open: boolean; title: string; description?: string; reasonLabel: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; initialReason?: string; minReasonLength?: number; busy?: boolean; onCancel: () => void; onConfirm: (reason: string) => void | Promise<void> }) {
  return <ActionDialog {...props} />;
}

export function Drawer({ open, title, children, onClose, side = "left", className = "" }: { open: boolean; title: ReactNode; children: ReactNode; onClose: () => void; side?: "left" | "right"; className?: string }) {
  const titleId = useId();
  const focus = useOverlayFocus(open, onClose);
  if (!open) return null;
  return <div className="fl-overlay-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><aside ref={focus.ref} tabIndex={-1} onKeyDown={focus.onKeyDown} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`fl-drawer fl-drawer-${side} ${className}`.trim()}><div className="fl-overlay-heading"><h2 id={titleId}>{title}</h2><IconButton label="Close drawer" onClick={onClose}><X size={18}/></IconButton></div>{children}</aside></div>;
}

export function BottomSheet({ open, title, children, onClose, className = "" }: { open: boolean; title: ReactNode; children: ReactNode; onClose: () => void; className?: string }) {
  const titleId = useId();
  const focus = useOverlayFocus(open, onClose);
  if (!open) return null;
  return <div className="fl-overlay-backdrop fl-bottom-sheet-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section ref={focus.ref} tabIndex={-1} onKeyDown={focus.onKeyDown} role="dialog" aria-modal="true" aria-labelledby={titleId} className={`fl-bottom-sheet ${className}`.trim()}><div className="fl-bottom-sheet-handle" aria-hidden="true"/><div className="fl-overlay-heading"><h2 id={titleId}>{title}</h2><IconButton label="Close sheet" onClick={onClose}><X size={18}/></IconButton></div>{children}</section></div>;
}

export function StickyActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`fl-sticky-action-bar ${className}`.trim()}>{children}</div>;
}
