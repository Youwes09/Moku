import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import s from "./ContextMenu.module.css";

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: never;
}

export interface ContextMenuSeparator {
  separator: true;
  label?: never;
  icon?: never;
  onClick?: never;
  danger?: never;
  disabled?: never;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface Props {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // Use capture so we intercept before other handlers
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  // Adjust position so menu doesn't clip outside viewport.
  // Compensate for CSS zoom (applied via document.documentElement.style.zoom)
  // because clientX/Y are pre-zoom pixels while `position:fixed` is post-zoom.
  const style = useCallback(() => {
    const zoom   = parseFloat(document.documentElement.style.zoom || "1") / 100 || 1;
    const scaledX = x / zoom;
    const scaledY = y / zoom;
    const menuW  = 200;
    const menuH  = items.length * 36;
    const vw     = window.innerWidth  / zoom;
    const vh     = window.innerHeight / zoom;
    const left   = scaledX + menuW > vw ? scaledX - menuW : scaledX;
    const top    = scaledY + menuH > vh ? scaledY - menuH : scaledY;
    return { left: Math.max(4, left), top: Math.max(4, top) };
  }, [x, y, items.length]);

  return createPortal(
    <div
      ref={menuRef}
      className={s.menu}
      style={style()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if ("separator" in item && item.separator) {
          return <div key={i} className={s.separator} />;
        }
        const mi = item as ContextMenuItem;
        return (
          <button
            key={i}
            className={[s.item, mi.danger ? s.itemDanger : "", mi.disabled ? s.itemDisabled : ""].join(" ").trim()}
            onClick={() => { if (!mi.disabled) { mi.onClick(); onClose(); } }}
            disabled={mi.disabled}
          >
            {mi.icon && <span className={s.itemIcon}>{mi.icon}</span>}
            <span className={s.itemLabel}>{mi.label}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}