<script>
  import { appState } from '../../lib/stores.svelte.js'
  import { getFirearm, getRoundCounts, fromEpoch } from '../../lib/db.js'
  import FirearmForm from './FirearmForm.svelte'
  import RoundCountList from '../rounds/RoundCountList.svelte'
  import EventList from '../events/EventList.svelte'
  import DocumentList from '../documents/DocumentList.svelte'

  let firearm = $state(null)
  let activeTab = $state('rounds')
  let showEditForm = $state(false)
  let chartRefresh = $state(0)

  $effect(() => {
    const id = appState.selectedFirearmId
    if (id) {
      firearm = getFirearm(appState.dbInstance, id)
    }
  })

  function totalRounds() {
    if (!firearm) return 0
    const rows = getRoundCounts(appState.dbInstance, firearm.id)
    return rows.reduce((sum, r) => sum + r.rounds_fired, 0)
  }

  function handleBack() {
    appState.currentView = 'firearms'
  }

  function closeEdit() {
    showEditForm = false
    firearm = getFirearm(appState.dbInstance, appState.selectedFirearmId)
  }

  function handleRoundsChanged() {
    chartRefresh += 1
  }
</script>

{#if showEditForm && firearm}
  <FirearmForm firearm={firearm} onClose={closeEdit} />
{/if}

{#if firearm}
  <div>
    <div class="mb-4 flex items-start justify-between">
      <div>
        <button
          type="button"
          onclick={handleBack}
          class="mb-2 text-sm text-text-muted hover:text-text-primary"
        >
          ← Back to Firearms
        </button>
        <h1 class="text-2xl font-bold text-text-primary">{firearm.name}</h1>
        <p class="mt-1 text-sm text-text-muted">
          {#if firearm.manufacturer}{firearm.manufacturer} · {/if}
          {#if firearm.caliber}{firearm.caliber} · {/if}
          S/N: {firearm.serial_number}
          {#if firearm.purchase_date} · Purchased {fromEpoch(firearm.purchase_date)}{/if}
          {#if firearm.ffl_dealer} · FFL: {firearm.ffl_dealer}{/if}
        </p>
      </div>
      <div class="flex items-start gap-3">
        <span class="rounded bg-accent-subtle px-3 py-1 text-sm font-medium text-accent">
          {totalRounds()} rounds
        </span>
        <button
          type="button"
          onclick={() => (showEditForm = true)}
          class="rounded bg-surface-raised px-3 py-2 text-sm font-medium text-text-primary hover:bg-border"
        >
          Edit
        </button>
      </div>
    </div>

    <!-- Tabs -->
    <div class="mb-4 flex gap-1 border-b border-border">
      {#each [['rounds', 'Round Counts'], ['events', 'Events'], ['documents', 'Documents']] as [tab, label] (tab)}
        <button
          type="button"
          onclick={() => (activeTab = tab)}
          class="px-4 py-2 text-sm font-medium transition-colors"
          class:text-accent={activeTab === tab}
          class:border-b-2={activeTab === tab}
          class:border-accent={activeTab === tab}
          class:text-text-muted={activeTab !== tab}
        >
          {label}
        </button>
      {/each}
    </div>

    <!-- Tab content -->
    {#if activeTab === 'rounds'}
      <RoundCountList firearmId={firearm.id} onChanged={handleRoundsChanged} refreshTrigger={chartRefresh} />
    {:else if activeTab === 'events'}
      <EventList firearmId={firearm.id} />
    {:else if activeTab === 'documents'}
      <DocumentList firearmId={firearm.id} />
    {/if}
  </div>
{/if}
