<script>
  import { appState } from '../lib/stores.svelte.js'
  import { strings } from '../lib/strings.js'
  import SaveButton from './SaveButton.svelte'

  let mobileOpen = $state(false)

  function navigate(view) {
    appState.currentView = view
    mobileOpen = false
  }

  function handleOverlayClick() {
    mobileOpen = false
  }
</script>

<!-- Mobile hamburger button -->
<button
  type="button"
  class="fixed top-4 left-4 z-40 rounded bg-surface-raised p-2 text-text-primary md:hidden"
  aria-label="Open navigation"
  onclick={() => (mobileOpen = true)}
>
  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
</button>

<!-- Mobile overlay backdrop -->
{#if mobileOpen}
  <div
    class="fixed inset-0 z-40 bg-black/50 md:hidden"
    role="button"
    tabindex="-1"
    aria-label="Close navigation"
    onclick={handleOverlayClick}
    onkeydown={(e) => e.key === 'Escape' && handleOverlayClick()}
  ></div>
{/if}

<!-- Sidebar panel -->
<nav
  class="fixed top-0 left-0 z-50 flex h-full w-56 flex-col bg-surface p-4 shadow-lg transition-transform md:translate-x-0 md:z-auto md:shadow-none"
  class:-translate-x-full={!mobileOpen}
  class:translate-x-0={mobileOpen}
  aria-label="Main navigation"
>
  <div class="mb-6 text-lg font-bold text-accent">FDB</div>

  <ul class="flex flex-1 flex-col gap-1">
    <li>
      <button
        type="button"
        onclick={() => navigate('firearms')}
        class="w-full rounded px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-raised"
        class:bg-surface-raised={appState.currentView === 'firearms' || appState.currentView === 'firearm-detail'}
        class:text-text-primary={appState.currentView === 'firearms' || appState.currentView === 'firearm-detail'}
        class:text-text-muted={appState.currentView !== 'firearms' && appState.currentView !== 'firearm-detail'}
      >
        Firearms
      </button>
    </li>
    <li>
      <button
        type="button"
        onclick={() => navigate('documents')}
        class="w-full rounded px-3 py-2 text-left text-sm font-medium transition-colors hover:bg-surface-raised"
        class:bg-surface-raised={appState.currentView === 'documents'}
        class:text-text-primary={appState.currentView === 'documents'}
        class:text-text-muted={appState.currentView !== 'documents'}
      >
        Documents
      </button>
    </li>
  </ul>

  {#if appState.dbInstance !== null}
    <div class="mt-4 border-t border-surface-raised pt-4">
      <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Settings</div>
      <label class="flex cursor-pointer items-center justify-between gap-2 py-1 text-sm text-text-primary">
        <span>{strings.settings.showSerials}</span>
        <input type="checkbox" bind:checked={appState.showSerials} class="h-4 w-4" />
      </label>
      <label class="flex cursor-pointer items-center justify-between gap-2 py-1 text-sm text-text-primary">
        <span>{strings.settings.confirmBeforeSave}</span>
        <input type="checkbox" bind:checked={appState.confirmBeforeSave} class="h-4 w-4" />
      </label>
    </div>
  {/if}

  <div class="mt-4">
    <SaveButton />
  </div>
</nav>
