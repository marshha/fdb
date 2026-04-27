<script>
  import { appState, markDirty, showToast } from '../../lib/stores.svelte.js'
  import { insertEvent, updateEvent } from '../../lib/db.js'
  import { strings } from '../../lib/strings.js'

  let { firearmId, event = null, onClose } = $props()

  function todayLocal() {
    const d = new Date()
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  let date = $state(event ? new Date(event.date).toLocaleDateString('sv') : todayLocal())
  let event_type = $state(event?.event_type ?? '')
  let title = $state(event?.title ?? '')
  let description = $state(event?.description ?? '')

  let titleError = $state('')

  const EVENT_TYPE_SUGGESTIONS = ['Maintenance', 'Malfunction', 'Modification', 'Note']

  function handleSubmit() {
    titleError = ''
    if (!title.trim()) {
      titleError = strings.errors.titleRequired
      return
    }

    const [y, m, d] = date.split('-').map(Number)
    const data = {
      firearm_id: firearmId,
      event_type: event_type.trim() || 'Note',
      date: new Date(y, m - 1, d).getTime(),
      title: title.trim(),
      description: description.trim() || null,
    }

    if (event) {
      updateEvent(appState.dbInstance, event.id, data)
      showToast(strings.toasts.eventUpdated)
    } else {
      insertEvent(appState.dbInstance, data)
      showToast(strings.toasts.eventAdded)
    }
    markDirty()
    onClose()
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
  role="dialog"
  aria-modal="true"
  aria-labelledby="event-form-title"
>
  <div class="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
    <h2 id="event-form-title" class="mb-4 text-lg font-semibold text-text-primary">
      {event ? 'Edit Event' : 'Add Event'}
    </h2>

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit() }} novalidate>
      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label for="ef-date" class="mb-1 block text-sm font-medium text-text-muted">Date</label>
          <input
            id="ef-date"
            type="date"
            bind:value={date}
            class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label for="ef-type" class="mb-1 block text-sm font-medium text-text-muted">Event Type</label>
          <input
            id="ef-type"
            type="text"
            list="ef-type-list"
            bind:value={event_type}
            class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          />
          <datalist id="ef-type-list">
            {#each EVENT_TYPE_SUGGESTIONS as s (s)}
              <option value={s}></option>
            {/each}
          </datalist>
        </div>
      </div>

      <div class="mb-4">
        <label for="ef-title" class="mb-1 block text-sm font-medium text-text-muted">Title *</label>
        <input
          id="ef-title"
          type="text"
          bind:value={title}
          class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          aria-describedby={titleError ? 'ef-title-error' : undefined}
          aria-invalid={titleError ? 'true' : undefined}
        />
        {#if titleError}
          <p id="ef-title-error" class="mt-1 text-xs text-danger" role="alert">{titleError}</p>
        {/if}
      </div>

      <div class="mb-6">
        <label for="ef-desc" class="mb-1 block text-sm font-medium text-text-muted">Description</label>
        <textarea
          id="ef-desc"
          bind:value={description}
          rows="4"
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
          {event ? 'Save Changes' : 'Add Event'}
        </button>
      </div>
    </form>
  </div>
</div>
