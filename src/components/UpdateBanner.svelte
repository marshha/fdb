<script>
  import { useRegisterSW } from 'virtual:pwa-register/svelte'

  const { needRefresh, updateServiceWorker } = useRegisterSW()
</script>

{#if $needRefresh}
  <div class="fixed bottom-0 left-0 right-0 flex items-center justify-between bg-surface-raised px-4 py-3 text-sm shadow-lg">
    <span class="text-text-primary">A new version is available.</span>
    <button
      type="button"
      onclick={() => updateServiceWorker(true)}
      class="rounded bg-accent px-3 py-1.5 text-xs font-medium text-text-inverse hover:bg-accent-hover"
    >
      Reload
    </button>
  </div>
{/if}
