import {
  Books, DownloadSimple, PuzzlePiece, Compass,
  GearSix, ClockCounterClockwise, MagnifyingGlass,
} from "@phosphor-icons/react";
import { useStore, type NavPage } from "../../store";
import s from "./Sidebar.module.css";

const TABS: { id: NavPage; icon: React.ReactNode; label: string }[] = [
  { id: "library",    icon: <Books size={18} weight="light" />,                  label: "Library"    },
  { id: "search",     icon: <MagnifyingGlass size={18} weight="light" />,        label: "Search"     },
  { id: "history",    icon: <ClockCounterClockwise size={18} weight="light" />,  label: "History"    },
  { id: "sources",    icon: <Compass size={18} weight="light" />,                label: "Sources"    },
  { id: "downloads",  icon: <DownloadSimple size={18} weight="light" />,         label: "Downloads"  },
  { id: "extensions", icon: <PuzzlePiece size={18} weight="light" />,            label: "Extensions" },
];

export default function Sidebar() {
  const navPage      = useStore((state) => state.navPage);
  const setNavPage   = useStore((state) => state.setNavPage);
  const setActiveSource = useStore((state) => state.setActiveSource);
  const openSettings = useStore((state) => state.openSettings);

  function navigate(id: NavPage) {
    setNavPage(id);
    if (id !== "sources") setActiveSource(null);
  }

  return (
    <aside className={s.root}>
      <div className={s.logo}>
        <div className={s.logoIcon} aria-label="Moku Logo" />
      </div>
      <nav className={s.nav}>
        {TABS.map((tab) => (
          <button key={tab.id} title={tab.label}
            onClick={() => navigate(tab.id)}
            className={[s.tab, navPage === tab.id ? s.tabActive : ""].join(" ")}>
            {tab.icon}
          </button>
        ))}
      </nav>
      <div className={s.bottom}>
        <button className={s.settingsBtn} onClick={openSettings} title="Settings">
          <GearSix size={18} weight="light" />
        </button>
      </div>
    </aside>
  );
}