export interface Toast {
  id:        string;
  kind:      "success" | "error" | "info" | "download";
  title:     string;
  body?:     string;
  duration?: number;
}

export interface ActiveDownload {
  chapterId: number;
  mangaId:   number;
  progress:  number;
}

class NotificationStore {
  toasts:          Toast[]          = $state([]);
  activeDownloads: ActiveDownload[] = $state([]);

  addToast(toast: Omit<Toast, "id">) {
    this.toasts = [...this.toasts, { ...toast, id: Math.random().toString(36).slice(2) }].slice(-5);
  }

  dismissToast(id: string) {
    this.toasts = this.toasts.filter(x => x.id !== id);
  }

  setActiveDownloads(next: ActiveDownload[]) {
    this.activeDownloads = next;
  }
}

export const notifications = new NotificationStore();

export function addToast(toast: Omit<Toast, "id">)        { notifications.addToast(toast); }
export function dismissToast(id: string)                   { notifications.dismissToast(id); }
export function setActiveDownloads(next: ActiveDownload[]) { notifications.setActiveDownloads(next); }
