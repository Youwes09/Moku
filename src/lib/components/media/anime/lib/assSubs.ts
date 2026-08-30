import JASSUB from "jassub";
import workerUrl from "jassub/dist/wasm/jassub-worker.js?url";
import wasmUrl from "jassub/dist/wasm/jassub-worker.wasm?url";
import modernWasmUrl from "jassub/dist/wasm/jassub-worker-modern.wasm?url";
import fontUrl from "jassub/dist/default.woff2?url";

export interface AssRenderer {
  destroy(): void;
  ready?: Promise<unknown>;
}

type Logger = (...a: unknown[]) => void;

export function mountAss(video: HTMLVideoElement, subContent: string, log: Logger = () => {}): AssRenderer {
  log("assSubs: asset URLs", { workerUrl, wasmUrl, modernWasmUrl, fontUrl });

  const inst = new JASSUB({
    video,
    subContent,
    workerUrl,
    wasmUrl,
    modernWasmUrl,
    fonts: [fontUrl],
  });

  log("assSubs: JASSUB constructed", inst);
  const ready = (inst as unknown as { ready?: Promise<unknown> }).ready;
  if (ready && typeof ready.then === "function") {
    ready.then(
      () => log("assSubs: JASSUB ready ✓"),
      (e: unknown) => log("assSubs: JASSUB ready REJECTED", e),
    );
  }

  const w = (inst as unknown as { _worker?: Worker })._worker;
  if (w) {
    w.addEventListener("error", (e) => log("assSubs: worker error", e.message ?? e));
    w.addEventListener("messageerror", (e) => log("assSubs: worker messageerror", e));
  }

  const readyProm = ready && typeof ready.then === "function" ? ready : Promise.resolve();

  return {
    ready: readyProm,
    destroy() {
      try {
        inst.destroy();
      } catch {
      }
    },
  };
}
