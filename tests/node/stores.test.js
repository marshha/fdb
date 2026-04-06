import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  appState,
  markDirty,
  markClean,
  showToast,
  showConfirm,
  showError,
  closeModal,
} from '../../src/lib/stores.svelte.js'

beforeEach(() => {
  // Reset state between tests
  markClean()
  closeModal()
  appState.toasts = []
})

describe('isDirty', () => {
  it('markDirty() sets isDirty to true', () => {
    markDirty()
    expect(appState.isDirty).toBe(true)
  })

  it('markClean() sets isDirty to false', () => {
    markDirty()
    markClean()
    expect(appState.isDirty).toBe(false)
  })
})

describe('toasts', () => {
  it('showToast adds entry to toasts array with correct message and type', () => {
    showToast('Hello', 'success')
    expect(appState.toasts).toHaveLength(1)
    expect(appState.toasts[0].message).toBe('Hello')
    expect(appState.toasts[0].type).toBe('success')
  })

  it('toast is removed from array after 4000ms (fake timers)', () => {
    vi.useFakeTimers()
    showToast('Temporary', 'success')
    expect(appState.toasts).toHaveLength(1)
    vi.advanceTimersByTime(4000)
    expect(appState.toasts).toHaveLength(0)
    vi.useRealTimers()
  })

  it('multiple toasts coexist; each is removed independently', () => {
    vi.useFakeTimers()
    showToast('First', 'success')
    vi.advanceTimersByTime(1000)
    showToast('Second', 'success')
    expect(appState.toasts).toHaveLength(2)
    vi.advanceTimersByTime(3000)
    // First toast expires at t=4000, second at t=5000
    expect(appState.toasts).toHaveLength(1)
    expect(appState.toasts[0].message).toBe('Second')
    vi.advanceTimersByTime(1000)
    expect(appState.toasts).toHaveLength(0)
    vi.useRealTimers()
  })
})

describe('modal', () => {
  it('showConfirm sets modalState with title, message, onConfirm', () => {
    const onConfirm = vi.fn()
    showConfirm({ title: 'Confirm Title', message: 'Are you sure?', onConfirm })
    expect(appState.modalState).toMatchObject({
      title: 'Confirm Title',
      message: 'Are you sure?',
      onConfirm,
    })
  })

  it('showError sets modalState with isError = true, no onConfirm', () => {
    showError({ title: 'Error Title', message: 'Something went wrong.' })
    expect(appState.modalState).toMatchObject({
      title: 'Error Title',
      message: 'Something went wrong.',
      isError: true,
    })
    expect(appState.modalState.onConfirm).toBeUndefined()
  })

  it('closeModal sets modalState to null', () => {
    showConfirm({ title: 'T', message: 'M', onConfirm: vi.fn() })
    closeModal()
    expect(appState.modalState).toBeNull()
  })

  it('onConfirm callback is invoked when called', () => {
    const onConfirm = vi.fn()
    showConfirm({ title: 'T', message: 'M', onConfirm })
    appState.modalState.onConfirm()
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})
