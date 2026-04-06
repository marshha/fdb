<script>
  import { appState, markDirty, showToast, showConfirm } from '../../lib/stores.svelte.js'
  import { getEvents, deleteEvent, fromEpoch } from '../../lib/db.js'
  import { strings } from '../../lib/strings.js'
  import EventForm from './EventForm.svelte'

  let { firearmId } = $props()

  let events = $state([])
  let showForm = $state(false)
  let editingEvent = $state(null)

  function load() {
    events = getEvents(appState.dbInstance, firearmId)
  }

  $effect(() => {
    if (firearmId) load()
  })

  function openAdd() {
    editingEvent = null
    showForm = true
  }

  function openEdit(ev) {
    editingEvent = ev
    showForm = true
  }

  function closeForm() {
    showForm = false
    editingEvent = null
    load()
  }

  function handleDelete(ev) {
    showConfirm({
      title: 'Delete Event',
      message: strings.confirm.deleteEvent,
      onConfirm() {
        deleteEvent(appState.dbInstance, ev.id)
        markDirty()
        load()
        showToast(strings.toasts.eventDeleted)
      },
    })
  }

  function truncate(text, max = 80) {
    if (!text) return '—'
    return text.length > max ? text.slice(0, max) + '…' : text
  }
</script>

{#if showForm}
  <EventForm {firearmId} event={editingEvent} onClose={closeForm} />
{/if}

<div class="flex items-center justify-between mb-4">
  <h2 class="text-lg font-semibold text-text-primary">Events</h2>
  <button
    type="button"
    onclick={openAdd}
    class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover"
  >
    Add Event
  </button>
</div>

{#if events.length === 0}
  <p class="text-sm text-text-muted">{strings.empty.events}</p>
{:else}
  <div class="overflow-x-auto rounded bg-surface">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-left text-text-muted">
          <th class="px-4 py-3 font-medium">Date</th>
          <th class="px-4 py-3 font-medium">Type</th>
          <th class="px-4 py-3 font-medium">Title</th>
          <th class="px-4 py-3 font-medium">Description</th>
          <th class="px-4 py-3 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each events as ev (ev.id)}
          <tr class="border-b border-border">
            <td class="px-4 py-3 text-text-muted">{fromEpoch(ev.date)}</td>
            <td class="px-4 py-3 text-text-muted">{ev.event_type}</td>
            <td class="px-4 py-3 font-medium text-text-primary">{ev.title}</td>
            <td class="px-4 py-3 text-text-muted">{truncate(ev.description)}</td>
            <td class="px-4 py-3">
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => openEdit(ev)}
                  class="text-xs text-text-muted hover:text-text-primary"
                  aria-label="Edit event {ev.title}"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onclick={() => handleDelete(ev)}
                  class="text-xs text-danger hover:opacity-80"
                  aria-label="Delete event {ev.title}"
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
{/if}
