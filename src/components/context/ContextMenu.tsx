import { useEffect, useRef, useCallback, useState } from "react";
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
  const menuRef     = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState<number>(-1);

  // Build list of actionable (non-separator, non-disabled) indices for keyboard nav
  const actionable = items
    .map((_, i) => i)
    .filter((i) => !("separator" in items[i]) && !(items[i] as ContextMenuItem).disabled);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocused((prev) => {
          const cur = actionable.indexOf(prev);
          return actionable[(cur + 1) % actionable.length] ?? actionable[0];
        });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocused((prev) => {
          const cur = actionable.indexOf(prev);
          return actionable[(cur - 1 + actionable.length) % actionable.length] ?? actionable[0];
        });
        return;
      }
      if (e.key === "Enter" && focused >= 0) {
        e.preventDefault();
        const item = items[focused] as ContextMenuItem;
        if (item && !item.disabled) { item.onClick(); onClose(); }
        return;
      }
    }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, focused, actionable, items]);

  // Focus first item on open
  useEffect(() => {
    if (actionable.length) setFocused(actionable[0]);
  }, []);

  const getPosition = useCallback(() => {
    const zoom   = parseFloat(document.documentElement.style.zoom || "1") / 100 || 1;
    const scaledX = x / zoom;
    const scaledY = y / zoom;
    const menuW  = 200;
    const menuH  = items.length * 34;
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
      style={getPosition()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        if ("separator" in item && item.separator) {
          return <div key={i} className={s.separator} />;
        }
        const mi = item as ContextMenuItem;
        const isFocused = focused === i;
        return (
          <button
            key={i}
            className={[
              s.item,
              mi.danger    ? s.itemDanger    : "",
              mi.disabled  ? s.itemDisabled  : "",
              isFocused    ? s.itemFocused   : "",
            ].filter(Boolean).join(" ")}
            onClick={() => { if (!mi.disabled) { mi.onClick(); onClose(); } }}
            onMouseEnter={() => !mi.disabled && setFocused(i)}
            onMouseLeave={() => setFocused(-1)}
            disabled={mi.disabled}
          >
            <span className={[s.itemIconWrap, mi.danger ? s.itemIconDanger : ""].filter(Boolean).join(" ")}>
              {mi.icon ?? null}
            </span>
            <span className={s.itemLabel}>{mi.label}</span>
          </button>
        );
      })}
    </div>,
    document.body
  );
}