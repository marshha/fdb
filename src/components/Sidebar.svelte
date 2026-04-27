<script>
  import { appState } from '../lib/stores.svelte.js'
  import { strings } from '../lib/strings.js'
  import SaveButton from './SaveButton.svelte'

  let mobileOpen = $state(false)
  let settingsOpen = $state(false)

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

  <div class="mt-4 flex flex-col gap-2">
    {#if appState.dbInstance !== null}
      <button
        type="button"
        onclick={() => (settingsOpen = true)}
        class="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm font-medium text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Settings
      </button>
    {/if}
    <SaveButton />
  </div>

</nav>

{#if settingsOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
  >
    <div class="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
      <h2 id="settings-title" class="mb-4 text-lg font-semibold text-text-primary">Settings</h2>
      <div class="flex flex-col gap-3">
        <label class="flex cursor-pointer items-center justify-between gap-4 text-sm text-text-primary">
          <span>{strings.settings.showSerials}</span>
          <input type="checkbox" bind:checked={appState.showSerials} class="h-4 w-4" />
        </label>
        <label class="flex cursor-pointer items-center justify-between gap-4 text-sm text-text-primary">
          <span>{strings.settings.confirmBeforeSave}</span>
          <input type="checkbox" bind:checked={appState.confirmBeforeSave} class="h-4 w-4" />
        </label>
      </div>
      <div class="mt-6 flex justify-end">
        <button
          type="button"
          onclick={() => (settingsOpen = false)}
          class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover"
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}
