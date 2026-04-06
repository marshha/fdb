<script>
  import { appState, markDirty, showToast, showConfirm } from '../../lib/stores.svelte.js'
  import { getRoundCounts, deleteRoundCount, fromEpoch } from '../../lib/db.js'
  import { strings } from '../../lib/strings.js'
  import RoundCountForm from './RoundCountForm.svelte'
  import RoundCountChart from './RoundCountChart.svelte'

  let { firearmId, onChanged } = $props()

  let sessions = $state([])
  let showForm = $state(false)
  let editingSession = $state(null)
  let chartRefresh = $state(0)

  function load() {
    sessions = getRoundCounts(appState.dbInstance, firearmId)
  }

  $effect(() => {
    if (firearmId) load()
  })

  let totalRounds = $derived(sessions.reduce((sum, s) => sum + s.rounds_fired, 0))

  function openAdd() {
    editingSession = null
    showForm = true
  }

  function openEdit(session) {
    editingSession = session
    showForm = true
  }

  function closeForm() {
    showForm = false
    editingSession = null
    load()
    chartRefresh += 1
    if (onChanged) onChanged()
  }

  function handleDelete(session) {
    showConfirm({
      title: 'Delete Session',
      message: strings.confirm.deleteRound,
      onConfirm() {
        deleteRoundCount(appState.dbInstance, session.id)
        markDirty()
        load()
        chartRefresh += 1
        if (onChanged) onChanged()
        showToast(strings.toasts.roundDeleted)
      },
    })
  }
</script>

{#if showForm}
  <RoundCountForm {firearmId} roundCount={editingSession} onClose={closeForm} />
{/if}

<div class="mb-6">
  <RoundCountChart {firearmId} refreshTrigger={chartRefresh} />
</div>

<div class="flex items-center justify-between mb-4">
  <h2 class="text-lg font-semibold text-text-primary">Round Count Sessions</h2>
  <button
    type="button"
    onclick={openAdd}
    class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover"
  >
    Add Session
  </button>
</div>

{#if sessions.length === 0}
  <p class="text-text-muted text-sm">{strings.empty.rounds}</p>
{:else}
  <div class="overflow-x-auto rounded bg-surface">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-left text-text-muted">
          <th class="px-4 py-3 font-medium">Date</th>
          <th class="px-4 py-3 font-medium">Rounds Fired</th>
          <th class="px-4 py-3 font-medium">Notes</th>
          <th class="px-4 py-3 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each sessions as session (session.id)}
          <tr class="border-b border-border">
            <td class="px-4 py-3 text-text-muted">{fromEpoch(session.date)}</td>
            <td class="px-4 py-3 text-text-primary">{session.rounds_fired}</td>
            <td class="px-4 py-3 text-text-muted">{session.notes ?? '—'}</td>
            <td class="px-4 py-3">
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => openEdit(session)}
                  class="text-xs text-text-muted hover:text-text-primary"
                  aria-label="Edit session"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onclick={() => handleDelete(session)}
                  class="text-xs text-danger hover:opacity-80"
                  aria-label="Delete session"
                >
                  Delete
                </button>
              </div>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <p class="mt-3 text-right text-sm font-medium text-text-muted">
    Total: <span class="text-text-primary">{totalRounds}</span> rounds
  </p>
{/if}
