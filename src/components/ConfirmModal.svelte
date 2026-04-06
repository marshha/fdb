<script>
  import { appState, closeModal } from '../lib/stores.svelte.js'

  function handleConfirm() {
    appState.modalState.onConfirm()
    closeModal()
  }

  function handleCancel() {
    closeModal()
  }
</script>

{#if appState.modalState !== null}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-title"
  >
    <div class="w-full max-w-md rounded-lg bg-surface p-6 shadow-xl">
      <h2 id="modal-title" class="mb-2 text-lg font-semibold text-text-primary">
        {appState.modalState.title}
      </h2>
      <p class="mb-6 text-sm text-text-muted">{appState.modalState.message}</p>

      {#if appState.modalState.isError}
        <div class="flex justify-end">
          <button
            type="button"
            onclick={handleCancel}
            class="rounded bg-accent px-4 py-2 text-sm font-medium text-text-inverse hover:bg-accent-hover"
          >
            OK
          </button>
        </div>
      {:else}
        <div class="flex justify-end gap-3">
          <button
            type="button"
            onclick={handleCancel}
            class="rounded bg-surface-raised px-4 py-2 text-sm font-medium text-text-primary hover:bg-border"
          >
            Cancel
          </button>
          <button
            type="button"
            onclick={handleConfirm}
            class="rounded bg-danger px-4 py-2 text-sm font-medium text-text-primary hover:opacity-80"
          >
            Confirm
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
