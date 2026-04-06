<script>
  import { appState, markDirty, showToast } from '../../lib/stores.svelte.js'
  import { insertFirearm, updateFirearm } from '../../lib/db.js'
  import { strings } from '../../lib/strings.js'

  let { firearm = null, onClose } = $props()

  let name = $state(firearm?.name ?? '')
  let serial_number = $state(firearm?.serial_number ?? '')
  let manufacturer = $state(firearm?.manufacturer ?? '')
  let caliber = $state(firearm?.caliber ?? '')
  let purchase_price = $state(firearm?.purchase_price ?? '')
  let purchase_date = $state(
    firearm?.purchase_date
      ? new Date(firearm.purchase_date).toLocaleDateString('sv') // YYYY-MM-DD in local time
      : '',
  )
  let ffl_dealer = $state(firearm?.ffl_dealer ?? '')
  let notes = $state(firearm?.notes ?? '')

  let nameError = $state('')
  let serialError = $state('')

  function handleSubmit() {
    nameError = ''
    serialError = ''

    let valid = true
    if (!name.trim()) {
      nameError = strings.errors.nameRequired
      valid = false
    }
    if (!serial_number.trim()) {
      serialError = strings.errors.serialRequired
      valid = false
    }
    if (!valid) return

    const data = {
      name: name.trim(),
      serial_number: serial_number.trim(),
      manufacturer: manufacturer.trim() || null,
      caliber: caliber.trim() || null,
      purchase_price: purchase_price !== '' ? parseFloat(purchase_price) : null,
      purchase_date: purchase_date ? new Date(purchase_date).getTime() : null,
      ffl_dealer: ffl_dealer.trim() || null,
      notes: notes.trim() || null,
    }

    try {
      if (firearm) {
        updateFirearm(appState.dbInstance, firearm.id, data)
        showToast(strings.toasts.firearmUpdated)
      } else {
        insertFirearm(appState.dbInstance, data)
        showToast(strings.toasts.firearmAdded)
      }
      markDirty()
      onClose()
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        serialError = strings.errors.duplicateSerial
      } else {
        throw err
      }
    }
  }
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
  role="dialog"
  aria-modal="true"
  aria-labelledby="firearm-form-title"
>
  <div class="w-full max-w-lg rounded-lg bg-surface p-6 shadow-xl">
    <h2 id="firearm-form-title" class="mb-4 text-lg font-semibold text-text-primary">
      {firearm ? 'Edit Firearm' : 'Add Firearm'}
    </h2>

    <form onsubmit={(e) => { e.preventDefault(); handleSubmit() }} novalidate>
      <div class="mb-4">
        <label for="ff-name" class="mb-1 block text-sm font-medium text-text-muted">Name *</label>
        <input
          id="ff-name"
          type="text"
          bind:value={name}
          class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          aria-describedby={nameError ? 'ff-name-error' : undefined}
          aria-invalid={nameError ? 'true' : undefined}
        />
        {#if nameError}
          <p id="ff-name-error" class="mt-1 text-xs text-danger" role="alert">{nameError}</p>
        {/if}
      </div>

      <div class="mb-4">
        <label for="ff-serial" class="mb-1 block text-sm font-medium text-text-muted">Serial Number *</label>
        <input
          id="ff-serial"
          type="text"
          bind:value={serial_number}
          class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
          aria-describedby={serialError ? 'ff-serial-error' : undefined}
          aria-invalid={serialError ? 'true' : undefined}
        />
        {#if serialError}
          <p id="ff-serial-error" class="mt-1 text-xs text-danger" role="alert">{serialError}</p>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label for="ff-manufacturer" class="mb-1 block text-sm font-medium text-text-muted">Manufacturer</label>
          <input id="ff-manufacturer" type="text" bind:value={manufacturer}
            class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
        <div>
          <label for="ff-caliber" class="mb-1 block text-sm font-medium text-text-muted">Caliber</label>
          <input id="ff-caliber" type="text" bind:value={caliber}
            class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label for="ff-price" class="mb-1 block text-sm font-medium text-text-muted">Purchase Price</label>
          <input id="ff-price" type="number" min="0" step="0.01" bind:value={purchase_price}
            class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
        <div>
          <label for="ff-date" class="mb-1 block text-sm font-medium text-text-muted">Purchase Date</label>
          <input id="ff-date" type="date" bind:value={purchase_date}
            class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
        </div>
      </div>

      <div class="mb-4">
        <label for="ff-ffl" class="mb-1 block text-sm font-medium text-text-muted">FFL Dealer</label>
        <input id="ff-ffl" type="text" bind:value={ffl_dealer}
          class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent" />
      </div>

      <div class="mb-6">
        <label for="ff-notes" class="mb-1 block text-sm font-medium text-text-muted">Notes</label>
        <textarea id="ff-notes" bind:value={notes} rows="3"
          class="w-full rounded border border-border bg-surface-raised px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"></textarea>
      </div>

      <div class="flex justify-end gap-3">
        <button type="button" onclick={onClose}
          class="rounded bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary hover:bg-border">
          Cancel
        </button>
        <button type="submit"
          class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover">
          {firearm ? 'Save Changes' : 'Add Firearm'}
        </button>
      </div>
    </form>
  </div>
</div>
