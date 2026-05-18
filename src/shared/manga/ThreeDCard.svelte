<script lang="ts">
  import { type Snippet } from "svelte";

  interface Props {
    children: Snippet;
    class?: string;
  }

  let { children, class: cls = "" }: Props = $props();
</script>

<div class="hover-3d {cls}">
  <div class="hover-3d-content">
    {@render children()}
  </div>
  <div></div>
  <div></div>
  <div></div>
  <div></div>
  <div></div>
  <div></div>
  <div></div>
  <div></div>
</div>

<style>
  .hover-3d {
    display: inline-grid;
    perspective: 75rem;
    --transform: 0, 0;
    --shine: 100% 100%;
    --shadow: 0rem 0rem 0rem;
    --ease-out: linear(0, 0.931 13.8%, 1.196 21.4%, 1.343 29.8%, 1.378 36%, 1.365 43.2%, 1.059 78%, 1);
    --ease-hover: linear(0, 0.708 15.2%, 0.927 23.6%, 1.067 33%, 1.12 41%, 1.13 50.2%, 1.019 83.2%, 1);
    filter:
      drop-shadow(var(--shadow) 0.1rem #00000020)
      drop-shadow(var(--shadow) 0.2rem #00000015)
      drop-shadow(var(--shadow) 0.3rem #00000010);
    transition: filter ease-out 400ms;
  }

  .hover-3d > :nth-child(n + 2) { isolation: isolate; z-index: 1; scale: 1.2; }

  .hover-3d > :nth-child(2) { grid-area: 1/1/2/2; }
  .hover-3d > :nth-child(3) { grid-area: 1/2/2/3; }
  .hover-3d > :nth-child(4) { grid-area: 1/3/2/4; }
  .hover-3d > :nth-child(5) { grid-area: 2/1/3/2; }
  .hover-3d > :nth-child(6) { grid-area: 2/3/3/4; }
  .hover-3d > :nth-child(7) { grid-area: 3/1/4/2; }
  .hover-3d > :nth-child(8) { grid-area: 3/2/4/3; }
  .hover-3d > :nth-child(9) { grid-area: 3/3/4/4; }

  .hover-3d-content {
    grid-area: 1/1/4/4; overflow: hidden; border-radius: inherit; position: relative;
    transform: rotate3d(var(--transform), 0, 10deg);
    transition:
      transform var(--ease-out) 500ms,
      scale     var(--ease-out) 500ms,
      outline-color ease-out 500ms;
    outline: 0.5px solid transparent; outline-offset: -1px;
  }

  .hover-3d-content::before {
    content: ""; pointer-events: none; position: absolute; inset: 0; z-index: 1;
    opacity: 0; filter: blur(0.75rem);
    background-image: radial-gradient(circle at 50%, rgba(255,255,255,0.18) 10%, transparent 50%);
    translate: var(--shine);
    transition: translate ease-out 400ms, opacity ease-out 400ms;
  }

  .hover-3d:hover { --ease-out: var(--ease-hover); }
  .hover-3d:hover > .hover-3d-content { scale: 1.05; outline-color: rgba(255,255,255,0.07); }
  .hover-3d:hover > .hover-3d-content::before { opacity: 1; }

  .hover-3d:has(> :nth-child(2):hover) { --transform: -1,  1; --shine:   0%   0%; --shadow: -0.5rem -0.5rem; }
  .hover-3d:has(> :nth-child(3):hover) { --transform: -1,  0; --shine: 100%   0%; --shadow:  0rem  -0.5rem; }
  .hover-3d:has(> :nth-child(4):hover) { --transform: -1, -1; --shine: 200%   0%; --shadow:  0.5rem -0.5rem; }
  .hover-3d:has(> :nth-child(5):hover) { --transform:  0,  1; --shine:   0% 100%; --shadow: -0.5rem  0rem;   }
  .hover-3d:has(> :nth-child(6):hover) { --transform:  0, -1; --shine: 200% 100%; --shadow:  0.5rem  0rem;   }
  .hover-3d:has(> :nth-child(7):hover) { --transform:  1,  1; --shine:   0% 200%; --shadow: -0.5rem  0.5rem; }
  .hover-3d:has(> :nth-child(8):hover) { --transform:  1,  0; --shine: 100% 200%; --shadow:  0rem   0.5rem;  }
  .hover-3d:has(> :nth-child(9):hover) { --transform:  1, -1; --shine: 200% 200%; --shadow:  0.5rem  0.5rem; }
</style>
