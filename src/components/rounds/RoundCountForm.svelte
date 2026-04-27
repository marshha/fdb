<script>
  import { appState, markDirty, showToast } from '../../lib/stores.svelte.js'
  import { insertRoundCount, updateRoundCount } from '../../lib/db.js'
  import { strings } from '../../lib/strings.js'

  let { firearmId, roundCount = null, onClose } = $props()

  function todayLocal() {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  let date = $state(roundCount ? new Date(roundCount.date).toLocaleDateString('sv') : todayLocal())
  let rounds_fired = $state(roundCount?.rounds_fired ?? '')
  let notes = $state(roundCount?.notes ?? '')

  let roundsError = $state('')

  function handleSubmit() {
    roundsError = ''
    const val = Number(rounds_fired)
    if (!rounds_fired || val < 1) {
      roundsError = strings.errors.roundsMin
      return
    }

    const [y, m, d] = date.split('-').map(Number)
    const data = {
      firearm_id: firearmId,
      date: new Date(y, m - 1, d).getTime(),
      rounds_fired: val,
      notes: notes.trim() || null,
    }

    if (roundCount) {
      updateRoundCount(appState.dbInstance, roundCount.id, data)
      showToast(strings.toasts.roundUpdated)
    } else {
      insertRoundCount(appState.dbInstance, data)
      showToast(strings.toasts.roundAdded)
    }
    markDirty()
    onClose()
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
  role="dialog"
  aria-modal="true"
  aria-labelledby="rc-form-title"
>
  <div class="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
    <h2 id="rc-form-title" class="mb-4 text-lg font-semibold text-text-primary">
      {roundCount ? 'Edit Session' : 'Add Session'}
    </h2>

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit() }} novalidate>
      <div class="mb-4">
        <label for="rc-date" class="mb-1 block text-sm font-medium text-text-muted">Date</label>
        <input
          id="rc-date"
          type="date"
          bind:value={date}
          class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        />
      </div>

      <div class="mb-4">
        <label for="rc-rounds" class="mb-1 block text-sm font-medium text-text-muted">Rounds Fired *</label>
        <input
          id="rc-rounds"
          type="number"
          min="1"
          bind:value={rounds_fired}
          class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          aria-describedby={roundsError ? 'rc-rounds-error' : undefined}
          aria-invalid={roundsError ? 'true' : undefined}
        />
        {#if roundsError}
          <p id="rc-rounds-error" class="mt-1 text-xs text-danger" role="alert">{roundsError}</p>
        {/if}
      </div>

      <div class="mb-6">
        <label for="rc-notes" class="mb-1 block text-sm font-medium text-text-muted">Notes</label>
        <textarea
          id="rc-notes"
          bind:value={notes}
          rows="3"
          class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
        ></textarea>
      </div>

      <div class="flex justify-end gap-3">
        <button
          type="button"
          onclick={onClose}
          class="rounded bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary hover:bg-border"
        >
          Cancel
        </button>
        <button
          type="submit"
          class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover"
        >
          {roundCount ? 'Save Changes' : 'Add Session'}
        </button>
      </div>
    </form>
  </div>
</div>
