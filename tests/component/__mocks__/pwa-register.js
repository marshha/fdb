import { readable } from 'svelte/store'

export function useRegisterSW() {
  return {
    needRefresh: readable(false),
    updateServiceWorker: () => {},
  }
}
