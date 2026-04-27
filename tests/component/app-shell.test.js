import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/lib/idb.js', () => ({
  loadHandle: vi.fn().mockResolvedValue(null),
  saveHandle: vi.fn().mockResolvedValue(undefined),
  clearHandle: vi.fn().mockResolvedValue(undefined),
  loadSettings: vi.fn().mockResolvedValue({ showSerials: false, confirmBeforeSave: false }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}))
import { render, screen } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import {
  appState,
  closeModal,
  showConfirm,
  showError,
  markClean,
  markDirty,
} from '../../src/lib/stores.svelte.js'

import App from '../../src/App.svelte'
import Sidebar from '../../src/components/Sidebar.svelte'
import Toast from '../../src/components/Toast.svelte'
import ConfirmModal from '../../src/components/ConfirmModal.svelte'

beforeEach(() => {
  appState.dbInstance = null
  appState.fileHandle = null
  appState.openFilename = null
  appState.currentView = 'landing'
  appState.toasts = []
  appState.modalState = null
  markClean()
})

describe('App.svelte', () => {
  it('renders Landing when dbInstance is null', () => {
    appState.dbInstance = null
    render(App)
    expect(screen.getByText('Open database')).toBeInTheDocument()
  })

  it('renders sidebar and content area when dbInstance is set', () => {
    appState.dbInstance = { fake: true }
    appState.openFilename = 'test.db'
    render(App)
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('document.title is "FDB" when openFilename is null', () => {
    appState.openFilename = null
    render(App)
    expect(document.title).toBe('FDB')
  })

  it('document.title is "FDB — firearms.db" when openFilename = "firearms.db"', () => {
    appState.dbInstance = { fake: true }
    appState.openFilename = 'firearms.db'
    render(App)
    expect(document.title).toBe('FDB — firearms.db')
  })

  it('beforeunload handler calls preventDefault when isDirty is true', () => {
    markDirty()
    render(App)
    const event = new Event('beforeunload', { cancelable: true })
    event.preventDefault = vi.fn()
    window.dispatchEvent(event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('beforeunload handler does not call preventDefault when isDirty is false', () => {
    markClean()
    render(App)
    const event = new Event('beforeunload', { cancelable: true })
    event.preventDefault = vi.fn()
    window.dispatchEvent(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

describe('beforeunload guard', () => {
  it('handler calls preventDefault when isDirty is true', () => {
    markDirty()
    render(App)
    const event = new Event('beforeunload', { cancelable: true })
    event.preventDefault = vi.fn()
    window.dispatchEvent(event)
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('handler does not call preventDefault when isDirty is false', () => {
    markClean()
    render(App)
    const event = new Event('beforeunload', { cancelable: true })
    event.preventDefault = vi.fn()
    window.dispatchEvent(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })

  it('handler is removed when App component is destroyed', () => {
    markDirty()
    const { unmount } = render(App)
    unmount()
    const event = new Event('beforeunload', { cancelable: true })
    event.preventDefault = vi.fn()
    window.dispatchEvent(event)
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

describe('Sidebar.svelte', () => {
  it('clicking Firearms nav sets currentView to "firearms"', async () => {
    appState.dbInstance = { fake: true }
    render(Sidebar)
    await userEvent.click(screen.getByRole('button', { name: 'Firearms' }))
    expect(appState.currentView).toBe('firearms')
  })

  it('clicking Documents nav sets currentView to "documents"', async () => {
    appState.dbInstance = { fake: true }
    render(Sidebar)
    await userEvent.click(screen.getByRole('button', { name: 'Documents' }))
    expect(appState.currentView).toBe('documents')
  })
})

describe('Toast.svelte', () => {
  it('renders a toast message from the toasts array', () => {
    appState.toasts = [{ id: 1, message: 'Saved!', type: 'success' }]
    render(Toast)
    expect(screen.getByText('Saved!')).toBeInTheDocument()
  })

  it('renders nothing when toasts is empty', () => {
    appState.toasts = []
    render(Toast)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('ConfirmModal.svelte', () => {
  it('renders nothing when modalState is null', () => {
    appState.modalState = null
    render(ConfirmModal)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders title and message when modalState is set', () => {
    showConfirm({ title: 'Delete?', message: 'Are you sure?', onConfirm: vi.fn() })
    render(ConfirmModal)
    expect(screen.getByText('Delete?')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('renders Cancel and Confirm buttons in confirm mode', () => {
    showConfirm({ title: 'Title', message: 'Msg', onConfirm: vi.fn() })
    render(ConfirmModal)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('renders only OK button in error mode', () => {
    showError({ title: 'Error', message: 'Something went wrong.' })
    render(ConfirmModal)
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('clicking Confirm calls onConfirm and closes modal', async () => {
    const onConfirm = vi.fn()
    showConfirm({ title: 'T', message: 'M', onConfirm })
    render(ConfirmModal)
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    expect(appState.modalState).toBeNull()
  })

  it('clicking Cancel closes modal without calling onConfirm', async () => {
    const onConfirm = vi.fn()
    showConfirm({ title: 'T', message: 'M', onConfirm })
    render(ConfirmModal)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(appState.modalState).toBeNull()
  })
})
