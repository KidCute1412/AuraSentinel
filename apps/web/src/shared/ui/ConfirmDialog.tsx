import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const btn = "inline-flex h-12 min-w-28 items-center justify-center rounded-none px-5 font-bold transition-transform duration-150";

/**
 * Modal confirmation. Focus starts on Cancel (the safe answer), Tab stays inside the dialog, Escape and a click
 * on the backdrop cancel, and focus returns to whatever had it before the dialog opened.
 * Rendered into document.body: the header animates with a transform, and a `fixed` child of a transformed ancestor
 * is positioned against that ancestor instead of the viewport.
 * The confirm button is green: red is reserved for danger (Kill-Switch, BLOCK), and signing out is not that.
 */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel = "Cancel", onConfirm, onCancel }: Props) {
  const titleId = useId();
  const bodyId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Tab") {
        const cancel = cancelRef.current;
        const confirm = confirmRef.current;
        if (!cancel || !confirm) return;
        if (e.shiftKey && document.activeElement === cancel) {
          e.preventDefault();
          confirm.focus();
        } else if (!e.shiftKey && document.activeElement === confirm) {
          e.preventDefault();
          cancel.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      before?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-bg/80" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        className="relative w-full max-w-md border border-line-strong bg-surface p-5 shadow-hard animate-feed-in sm:p-6"
      >
        <span className="mono-label">CONFIRM</span>
        <h2 id={titleId} className="mt-2 text-2xl font-extrabold tracking-tight">{title}</h2>
        <p id={bodyId} className="mt-2 text-soft">{body}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button ref={cancelRef} type="button" onClick={onCancel} className={`${btn} border border-line-strong text-fg hover:bg-hover`}>
            {cancelLabel}
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className={`${btn} bg-accent text-on-accent hover:-translate-x-px hover:-translate-y-px hover:shadow-hard-sm active:translate-x-0 active:translate-y-0 active:shadow-none`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
