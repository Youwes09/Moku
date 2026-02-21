import { useStore } from "../../store";
import Sidebar from "./Sidebar";
import Library from "../pages/Library";
import SeriesDetail from "../pages/SeriesDetail";
import History from "../pages/History";
import Search from "../pages/Search";
import SourceList from "../sources/SourceList";
import SourceBrowse from "../sources/SourceBrowse";
import DownloadQueue from "../downloads/DownloadQueue";
import ExtensionList from "../extensions/ExtensionList";
import s from "./Layout.module.css";

export default function Layout() {
  const navPage     = useStore((s) => s.navPage);
  const activeManga = useStore((s) => s.activeManga);
  const activeSource = useStore((s) => s.activeSource);

  function renderContent() {
    if (navPage === "library" && activeManga) return <SeriesDetail />;
    if (navPage === "sources" && activeSource) return <SourceBrowse />;
    switch (navPage) {
      case "library":    return <Library />;
      case "search":     return <Search />;
      case "history":    return <History />;
      case "sources":    return <SourceList />;
      case "downloads":  return <DownloadQueue />;
      case "extensions": return <ExtensionList />;
      default:           return <Library />;
    }
  }

  return (
    <div className={s.root}>
      <Sidebar />
      <main className={s.main}>{renderContent()}</main>
    </div>
  );
}