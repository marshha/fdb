<script>
  import { appState } from './lib/stores.svelte.js'
  import { strings } from './lib/strings.js'
  import Landing from './components/Landing.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import Toast from './components/Toast.svelte'
  import ConfirmModal from './components/ConfirmModal.svelte'

  // Reactive document.title
  $effect(() => {
    if (!appState.openFilename) {
      document.title = strings.titles.base
    } else if (appState.openFilename === 'unsaved') {
      document.title = strings.titles.unsaved
    } else {
      document.title = strings.titles.withFile(appState.openFilename)
    }
  })

  // beforeunload guard
  function handleBeforeUnload(e) {
    if (appState.isDirty) {
      e.preventDefault()
      e.returnValue = ''
    }
  }

  $effect(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  })
</script>

<Toast />
<ConfirmModal />

{#if appState.dbInstance === null}
  <Landing />
{:else}
  <div class="flex min-h-screen bg-bg">
    <Sidebar />
    <main class="flex-1 p-6 md:ml-56">
      {#if appState.currentView === 'firearms' || appState.currentView === 'firearm-detail'}
        <!-- FirearmList / FirearmDetail loaded in Step 9 -->
        <p class="text-text-muted">Firearms view (Step 9)</p>
      {:else if appState.currentView === 'documents'}
        <!-- DocumentList loaded in Step 11 -->
        <p class="text-text-muted">Documents view (Step 11)</p>
      {/if}
    </main>
  </div>
{/if}
