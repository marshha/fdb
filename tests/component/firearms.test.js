import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import {
  appState,
  closeModal,
  markClean,
} from '../../src/lib/stores.svelte.js'
import {
  initSqlite,
  createDatabase,
  insertFirearm,
  insertRoundCount,
  getAllFirearms,
  getFirearm,
  toEpoch,
} from '../../src/lib/db.js'

import FirearmList from '../../src/components/firearms/FirearmList.svelte'
import FirearmForm from '../../src/components/firearms/FirearmForm.svelte'

// Initialise SQLite once for the entire suite
await initSqlite()

let db

beforeEach(async () => {
  db = await createDatabase()
  appState.dbInstance = db
  appState.currentView = 'firearms'
  appState.selectedFirearmId = null
  appState.toasts = []
  appState.modalState = null
  markClean()
  closeModal()
})

describe('FirearmList', () => {
  it('renders empty state when db has no firearms', () => {
    render(FirearmList)
    expect(screen.getByText('No firearms yet.')).toBeInTheDocument()
  })

  it('renders one row per firearm', () => {
    insertFirearm(db, { name: 'Rifle A', serial_number: 'SN-001' })
    insertFirearm(db, { name: 'Pistol B', serial_number: 'SN-002' })
    render(FirearmList)
    expect(screen.getByText('Rifle A')).toBeInTheDocument()
    expect(screen.getByText('Pistol B')).toBeInTheDocument()
  })

  it('displays computed total_rounds correctly', () => {
    const id = insertFirearm(db, { name: 'Rifle A', serial_number: 'SN-001' })
    insertRoundCount(db, { firearm_id: id, date: Date.now(), rounds_fired: 50 })
    insertRoundCount(db, { firearm_id: id, date: Date.now(), rounds_fired: 25 })
    render(FirearmList)
    expect(screen.getByText('75')).toBeInTheDocument()
  })

  it('clicking a row navigates to firearm-detail', async () => {
    const id = insertFirearm(db, { name: 'Rifle A', serial_number: 'SN-001' })
    render(FirearmList)
    await userEvent.click(screen.getByText('Rifle A'))
    expect(appState.currentView).toBe('firearm-detail')
    expect(appState.selectedFirearmId).toBe(id)
  })

  it('clicking Name header sorts ascending; clicking again sorts descending', async () => {
    insertFirearm(db, { name: 'Zebra', serial_number: 'SN-Z' })
    insertFirearm(db, { name: 'Alpha', serial_number: 'SN-A' })
    render(FirearmList)
    const nameHeader = screen.getByRole('button', { name: /^Name/ })
    // Default is already asc; click once more to go desc
    await userEvent.click(nameHeader)
    const rows = screen.getAllByRole('row')
    // First data row (index 1, header is 0) should be Zebra when sorted desc
    expect(rows[1]).toHaveTextContent('Zebra')
    // Click again → asc
    await userEvent.click(nameHeader)
    const rows2 = screen.getAllByRole('row')
    expect(rows2[1]).toHaveTextContent('Alpha')
  })

  it('clicking Add Firearm opens FirearmForm modal', async () => {
    render(FirearmList)
    await userEvent.click(screen.getAllByRole('button', { name: 'Add Firearm' })[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clicking Delete shows ConfirmModal with consequence counts', async () => {
    insertFirearm(db, { name: 'Rifle A', serial_number: 'SN-001' })
    render(FirearmList)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Rifle A' }))
    expect(appState.modalState).not.toBeNull()
    expect(appState.modalState.title).toBe('Delete Firearm')
  })

  it('confirming delete calls deleteFirearm, refreshes list, shows toast', async () => {
    insertFirearm(db, { name: 'Rifle A', serial_number: 'SN-001' })
    render(FirearmList)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Rifle A' }))
    // Invoke onConfirm directly
    appState.modalState.onConfirm()
    // After deletion the list should be empty (wait for reactive update)
    await waitFor(() => expect(screen.getByText('No firearms yet.')).toBeInTheDocument())
    expect(appState.toasts.length).toBeGreaterThan(0)
  })
})

describe('FirearmForm', () => {
  it('shows inline error on Name when submitted empty', async () => {
    render(FirearmForm, { props: { onClose: vi.fn() } })
    await userEvent.click(screen.getByRole('button', { name: 'Add Firearm' }))
    expect(screen.getByText('Name is required.')).toBeInTheDocument()
  })

  it('shows inline error on Serial when submitted empty', async () => {
    render(FirearmForm, { props: { onClose: vi.fn() } })
    await userEvent.type(screen.getByLabelText(/Name/), 'Test')
    await userEvent.click(screen.getByRole('button', { name: 'Add Firearm' }))
    expect(screen.getByText('Serial number is required.')).toBeInTheDocument()
  })

  it('shows user-friendly duplicate serial error (not raw SQLite message)', async () => {
    insertFirearm(db, { name: 'Existing', serial_number: 'DUP-001' })
    render(FirearmForm, { props: { onClose: vi.fn() } })
    await userEvent.type(screen.getByLabelText(/Name/), 'New Gun')
    await userEvent.type(screen.getByLabelText(/Serial Number/), 'DUP-001')
    await userEvent.click(screen.getByRole('button', { name: 'Add Firearm' }))
    expect(screen.getByText('A firearm with this serial number already exists.')).toBeInTheDocument()
  })

  it('successful create calls insertFirearm with correct data', async () => {
    const onClose = vi.fn()
    render(FirearmForm, { props: { onClose } })
    await userEvent.type(screen.getByLabelText(/Name/), 'My Rifle')
    await userEvent.type(screen.getByLabelText(/Serial Number/), 'SR-999')
    await userEvent.click(screen.getByRole('button', { name: 'Add Firearm' }))
    expect(onClose).toHaveBeenCalledOnce()
    const firearms = getAllFirearms(db)
    expect(firearms).toHaveLength(1)
    expect(firearms[0].name).toBe('My Rifle')
  })

  it('successful edit calls updateFirearm with correct id and data', async () => {
    const id = insertFirearm(db, { name: 'Old Name', serial_number: 'SN-001' })
    const firearm = { id, name: 'Old Name', serial_number: 'SN-001' }
    const onClose = vi.fn()
    render(FirearmForm, { props: { firearm, onClose } })
    const nameInput = screen.getByLabelText(/Name/)
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'New Name')
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(onClose).toHaveBeenCalledOnce()
    const updated = getFirearm(db, id)
    expect(updated.name).toBe('New Name')
  })

  it('calls onClose after successful submit', async () => {
    const onClose = vi.fn()
    render(FirearmForm, { props: { onClose } })
    await userEvent.type(screen.getByLabelText(/Name/), 'My Rifle')
    await userEvent.type(screen.getByLabelText(/Serial Number/), 'SR-888')
    await userEvent.click(screen.getByRole('button', { name: 'Add Firearm' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stores purchase_date as local midnight, not UTC midnight', async () => {
    const onClose = vi.fn()
    render(FirearmForm, { props: { onClose } })
    await userEvent.type(screen.getByLabelText(/Name/), 'Test Gun')
    await userEvent.type(screen.getByLabelText(/Serial Number/), 'SN-DATE-01')
    fireEvent.input(screen.getByLabelText(/Purchase Date/), { target: { value: '2024-03-15' } })
    await userEvent.click(screen.getByRole('button', { name: 'Add Firearm' }))
    const firearm = getAllFirearms(db)[0]
    const d = new Date(firearm.purchase_date)
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(2) // 0-indexed: March = 2
    expect(d.getDate()).toBe(15)
  })
})
