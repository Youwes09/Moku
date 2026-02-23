import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { CheckCircle, X, WarningCircle, Info, DownloadSimple } from "@phosphor-icons/react";
import { useStore } from "../../store";
import s from "./Toaster.module.css";

export type ToastKind = "success" | "error" | "info" | "download";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  duration?: number; // ms, 0 = persistent
}

// ── icons per kind ──────────────────────────────────────────────────────────

function ToastIcon({ kind }: { kind: ToastKind }) {
  const size = 15;
  const w = "light" as const;
  if (kind === "success")  return <CheckCircle  size={size} weight={w} />;
  if (kind === "error")    return <WarningCircle size={size} weight={w} />;
  if (kind === "download") return <DownloadSimple size={size} weight={w} />;
  return <Info size={size} weight={w} />;
}

// ── individual toast ─────────────────────────────────────────────────────────

function ToastItem({ toast }: { toast: Toast }) {
  const dismissToast = useStore((s) => s.dismissToast);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const duration = toast.duration ?? 3500;

  useEffect(() => {
    if (duration === 0) return;
    timerRef.current = setTimeout(() => dismissToast(toast.id), duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [toast.id, duration]);

  return (
    <div className={[s.toast, s[`toast_${toast.kind}`]].join(" ")} role="alert">
      <span className={s.toastIcon}><ToastIcon kind={toast.kind} /></span>
      <div className={s.toastBody}>
        <p className={s.toastTitle}>{toast.title}</p>
        {toast.body && <p className={s.toastSub}>{toast.body}</p>}
      </div>
      <button className={s.toastClose} onClick={() => dismissToast(toast.id)} title="Dismiss">
        <X size={12} weight="light" />
      </button>
    </div>
  );
}

// ── toaster container ────────────────────────────────────────────────────────

export default function Toaster() {
  const toasts = useStore((s) => s.toasts);

  if (!toasts.length) return null;

  return createPortal(
    <div className={s.toaster} aria-live="polite">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>,
    document.body
  );
}