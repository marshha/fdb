<script>
  import { onMount } from 'svelte'
  import { appState } from './lib/stores.svelte.js'
  import { strings } from './lib/strings.js'
  import { loadSettings, saveSettings } from './lib/idb.js'
  import Landing from './components/Landing.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import Toast from './components/Toast.svelte'
  import ConfirmModal from './components/ConfirmModal.svelte'
  import UpdateBanner from './components/UpdateBanner.svelte'
  import FirearmList from './components/firearms/FirearmList.svelte'
  import FirearmDetail from './components/firearms/FirearmDetail.svelte'
  import DocumentList from './components/documents/DocumentList.svelte'

  onMount(async () => {
    const s = await loadSettings()
    appState.showSerials = s.showSerials
    appState.confirmBeforeSave = s.confirmBeforeSave
  })

  $effect(() => {
    saveSettings({
      showSerials: appState.showSerials,
      confirmBeforeSave: appState.confirmBeforeSave,
    })
  })

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
<UpdateBanner />

{#if appState.dbInstance === null}
  <Landing />
{:else}
  <div class="flex min-h-screen bg-bg">
    <Sidebar />
    <main class="flex-1 p-6 md:ml-56">
      {#if appState.currentView === 'firearms'}
        <FirearmList />
      {:else if appState.currentView === 'firearm-detail'}
        <FirearmDetail />
      {:else if appState.currentView === 'documents'}
        <DocumentList />
      {/if}
    </main>
  </div>
{/if}
