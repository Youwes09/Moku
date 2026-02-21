import { getCurrentWindow } from "@tauri-apps/api/window";
import s from "./TitleBar.module.css";

const win = getCurrentWindow();

export default function TitleBar() {
  return (
    <div className={s.bar} data-tauri-drag-region>
      <span className={s.title} data-tauri-drag-region>Moku</span>
      <div className={s.controls}>
        <button
          className={s.btn}
          onClick={() => win.minimize()}
          title="Minimize"
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          className={s.btn}
          onClick={() => win.toggleMaximize()}
          title="Maximize"
          aria-label="Maximize"
        >
          <svg width="9" height="9" viewBox="0 0 9 9">
            <rect x="0.75" y="0.75" width="7.5" height="7.5" rx="1"
              fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          className={[s.btn, s.btnClose].join(" ")}
          onClick={() => win.close()}
          title="Close"
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}