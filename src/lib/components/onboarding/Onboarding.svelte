<script lang="ts">
  import logoUrl                                    from '$lib/assets/moku-icon-splash.svg'
  import { onboardingState, completeOnboarding, skipOnboarding, startTour } from '$lib/state/onboarding.svelte'
</script>

{#if onboardingState.open}
  <div class="overlay">
    <div class="card">
      <img src={logoUrl} alt="Moku" class="logo" style="--i:0" />
      <p class="title" style="--i:1">welcome to moku</p>
      <p class="body" style="--i:2">A quick tour of the essentials, or skip straight in.</p>

      <button class="btn" style="--i:3" onclick={() => { completeOnboarding(); startTour() }}>Get started</button>
      <button class="btn btn--ghost" style="--i:4" onclick={skipOnboarding}>Skip</button>
    </div>
  </div>
{/if}

<style>
  .overlay { position:fixed; inset:0; z-index:10000; display:flex; align-items:center; justify-content:center; background:rgba(6,7,9,0.62); backdrop-filter:blur(2px); animation:overlayIn 0.8s cubic-bezier(0.16,1,0.3,1) both; }

  .card { width:min(320px, calc(100vw - 48px)); background:var(--bg-surface); border:1px solid var(--border-base); border-radius:var(--radius-xl); padding:var(--sp-6) var(--sp-5); display:flex; flex-direction:column; align-items:center; gap:var(--sp-3); box-shadow:0 32px 90px rgba(0,0,0,0.7); text-align:center; animation:cardIn 0.9s cubic-bezier(0.16,1,0.3,1) 0.12s both; }

  .logo  { width:56px; height:56px; border-radius:14px; display:block; }
  .title { font-family:var(--font-ui); font-size:11px; font-weight:500; letter-spacing:0.26em; text-transform:uppercase; color:var(--text-secondary); margin:-6px 0 0; user-select:none; }
  .body  { font-family:var(--font-ui); font-size:var(--text-sm); color:var(--text-faint); margin:0; }

  .card > * { animation:riseIn 0.7s cubic-bezier(0.16,1,0.3,1) both; animation-delay:calc(0.28s + var(--i,0) * 0.08s); }

  .btn                              { width:100%; padding:9px; border-radius:var(--radius-md); background:var(--accent-muted); border:1px solid var(--accent-dim); color:var(--accent-fg); font-size:var(--text-sm); font-family:var(--font-ui); letter-spacing:var(--tracking-wide); cursor:pointer; transition:filter var(--t-base), background var(--t-base); }
  .btn:hover                        { filter:brightness(1.12); }
  .btn--ghost                       { background:none; border-color:transparent; color:var(--text-faint); font-size:var(--text-xs); padding:4px; }
  .btn--ghost:hover                 { color:var(--text-muted); opacity:1; }

  @keyframes overlayIn { from { opacity:0 } to { opacity:1 } }
  @keyframes cardIn    { from { opacity:0; transform:translateY(18px) scale(0.98) } to { opacity:1; transform:translateY(0) scale(1) } }
  @keyframes riseIn    { from { opacity:0; transform:translateY(10px) } to { opacity:1; transform:translateY(0) } }

  @media (prefers-reduced-motion:reduce) {
    .overlay, .card, .card > * { animation-duration:0.01ms; animation-delay:0ms; }
  }
</style>