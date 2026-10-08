import { useEffect, useId, useRef, useState } from "react";
import { trapFocus } from "../system/focusManagement";

export function ActionDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  reasonLabel,
  initialReason = "",
  minReasonLength = 5,
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  reasonLabel?: string;
  initialReason?: string;
  minReasonLength?: number;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [reason, setReason] = useState(initialReason);
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    setReason(initialReason);
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => (reasonLabel ? reasonRef.current : cancelRef.current)?.focus());
    return () => previous?.focus?.();
  }, [open, initialReason, reasonLabel]);

  if (!open) return null;
  const reasonRequired = Boolean(reasonLabel);
  const valid = !reasonRequired || reason.trim().length >= minReasonLength;

  return (
    <div className="action-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section
        ref={dialogRef}
        className="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !busy) {
            event.preventDefault();
            onCancelRef.current();
            return;
          }
          trapFocus(event, dialogRef.current);
        }}
      >
        <div className="action-dialog-copy">
          <span className="eyebrow">CONFIRM ACTION</span>
          <h2 id={titleId}>{title}</h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        {reasonLabel && (
          <label className="field">
            {reasonLabel}
            <textarea
              ref={reasonRef}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={minReasonLength}
              maxLength={2000}
              required
            />
          </label>
        )}
        <div className="action-dialog-actions">
          <button ref={cancelRef} type="button" className="secondary" disabled={busy} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={danger ? "danger-action" : "primary"} disabled={busy || !valid} onClick={() => void onConfirm(reason.trim())}>
            {busy ? "Please wait…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
