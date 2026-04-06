<script>
  import { appState } from '../lib/stores.svelte.js'
</script>

<div class="fixed top-4 right-4 z-50 flex flex-col gap-2">
  {#each appState.toasts as toast (toast.id)}
    <div
      class="rounded px-4 py-3 text-sm font-medium shadow-lg"
      class:bg-success={toast.type === 'success'}
      class:bg-danger={toast.type === 'error'}
      class:text-text-inverse={true}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  {/each}
</div>
