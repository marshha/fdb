<script>
  import { appState, markDirty, showToast, showConfirm } from '../../lib/stores.svelte.js'
  import {
    getAllFirearms,
    deleteFirearm,
    getRoundCounts,
    getEvents,
    getDocumentsForFirearm,
  } from '../../lib/db.js'
  import { fromEpoch } from '../../lib/db.js'
  import { strings } from '../../lib/strings.js'
  import FirearmForm from './FirearmForm.svelte'

  let firearms = $state([])
  let sortColumn = $state('name')
  let sortDir = $state('asc')
  let showForm = $state(false)
  let editingFirearm = $state(null)

  function load() {
    firearms = getAllFirearms(appState.dbInstance)
  }

  $effect(() => {
    if (appState.currentView === 'firearms') {
      sortColumn = 'name'
      sortDir = 'asc'
      load()
    }
  })

  let sorted = $derived.by(() => {
    const col = sortColumn
    const dir = sortDir
    return [...firearms].sort((a, b) => {
      const av = a[col] ?? 0
      const bv = b[col] ?? 0
      if (typeof av === 'string') {
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return dir === 'asc' ? av - bv : bv - av
    })
  })

  function handleSort(col) {
    if (sortColumn === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      sortColumn = col
      sortDir = 'asc'
    }
  }

  function openAdd() {
    editingFirearm = null
    showForm = true
  }

  function openEdit(firearm) {
    editingFirearm = firearm
    showForm = true
  }

  function closeForm() {
    showForm = false
    editingFirearm = null
    load()
  }

  function handleRowClick(firearm) {
    appState.selectedFirearmId = firearm.id
    appState.currentView = 'firearm-detail'
  }

  function handleDelete(firearm) {
    const db = appState.dbInstance
    const rounds = getRoundCounts(db, firearm.id).length
    const events = getEvents(db, firearm.id).length
    const docs = getDocumentsForFirearm(db, firearm.id).length
    showConfirm({
      title: 'Delete Firearm',
      message: strings.confirm.deleteFirearm(rounds, events, docs),
      onConfirm() {
        deleteFirearm(db, firearm.id)
        markDirty()
        load()
        showToast(strings.toasts.firearmDeleted)
      },
    })
  }

  function sortArrow(col) {
    if (sortColumn !== col) return ''
    return sortDir === 'asc' ? ' ▲' : ' ▼'
  }
</script>

{#if showForm}
  <FirearmForm firearm={editingFirearm} onClose={closeForm} />
{/if}

<div class="flex items-center justify-between mb-4">
  <h1 class="text-xl font-semibold text-text-primary">Firearms</h1>
  <button
    type="button"
    onclick={openAdd}
    class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover"
  >
    Add Firearm
  </button>
</div>

{#if sorted.length === 0}
  <div class="rounded bg-surface p-8 text-center text-text-muted">
    <p>{strings.empty.firearms}</p>
    <button
      type="button"
      onclick={openAdd}
      class="mt-4 rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover"
    >
      Add Firearm
    </button>
  </div>
{:else}
  <div class="overflow-x-auto rounded bg-surface">
    <table class="w-full text-sm">
      <thead>
        <tr class="border-b border-border text-left text-text-muted">
          <th class="px-4 py-3">
            <button type="button" onclick={() => handleSort('name')} class="font-medium hover:text-text-primary">
              Name{sortArrow('name')}
            </button>
          </th>
          <th class="px-4 py-3 font-medium">Manufacturer</th>
          <th class="px-4 py-3">
            <button type="button" onclick={() => handleSort('caliber')} class="font-medium hover:text-text-primary">
              Caliber{sortArrow('caliber')}
            </button>
          </th>
          <th class="px-4 py-3 font-medium">
            <button
              type="button"
              onclick={() => (appState.showSerials = !appState.showSerials)}
              class="flex items-center gap-1 font-medium hover:text-text-primary"
              title={appState.showSerials ? 'Hide serial numbers' : 'Show serial numbers'}
            >
              Serial Number
              <span class="text-xs opacity-60">{appState.showSerials ? '🔓' : '🔒'}</span>
            </button>
          </th>
          <th class="px-4 py-3">
            <button type="button" onclick={() => handleSort('total_rounds')} class="font-medium hover:text-text-primary">
              Total Rounds{sortArrow('total_rounds')}
            </button>
          </th>
          <th class="px-4 py-3">
            <button type="button" onclick={() => handleSort('purchase_date')} class="font-medium hover:text-text-primary">
              Purchase Date{sortArrow('purchase_date')}
            </button>
          </th>
          <th class="px-4 py-3 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {#each sorted as firearm (firearm.id)}
          <tr
            class="border-b border-border hover:bg-surface-raised cursor-pointer"
            onclick={() => handleRowClick(firearm)}
          >
            <td class="px-4 py-3 font-medium text-text-primary">{firearm.name}</td>
            <td class="px-4 py-3 text-text-muted">{firearm.manufacturer ?? '—'}</td>
            <td class="px-4 py-3 text-text-muted">{firearm.caliber ?? '—'}</td>
            <td class="px-4 py-3 text-text-muted">
              {appState.showSerials ? firearm.serial_number : '••••••••'}
            </td>
            <td class="px-4 py-3 text-text-primary">{firearm.total_rounds}</td>
            <td class="px-4 py-3 text-text-muted">
              {firearm.purchase_date ? fromEpoch(firearm.purchase_date) : '—'}
            </td>
            <td class="px-4 py-3" onclick={(e) => e.stopPropagation()}>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => openEdit(firearm)}
                  class="text-xs text-text-muted hover:text-text-primary"
                  aria-label="Edit {firearm.name}"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onclick={() => handleDelete(firearm)}
                  class="text-xs text-danger hover:opacity-80"
                  aria-label="Delete {firearm.name}"
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
