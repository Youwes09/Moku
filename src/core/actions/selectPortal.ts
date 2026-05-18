import type { Attachment } from "svelte/attachments";

export function selectPortal(triggerEl: HTMLElement & { __selectMenuEl?: HTMLElement | null }): Attachment {
  return (menuEl: HTMLElement) => {
    function position() {
      const zoom = parseFloat(document.documentElement.style.zoom) / 100 || 1;
      const r = triggerEl.getBoundingClientRect();

      const top  = r.bottom / zoom + 4;
      const right = r.right / zoom;
      const width = menuEl.offsetWidth;
      const left = Math.max(8, right - width);

      menuEl.style.position = "fixed";
      menuEl.style.top      = `${top}px`;
      menuEl.style.left     = `${left}px`;
    }

    menuEl.style.visibility = "hidden";
    document.body.appendChild(menuEl);
    triggerEl.__selectMenuEl = menuEl;

    requestAnimationFrame(() => {
      position();
      menuEl.style.visibility = "";
    });

    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);

    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
      triggerEl.__selectMenuEl = null;
      menuEl.remove();
    };
  };
}