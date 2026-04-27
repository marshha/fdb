import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { appState, closeModal, markClean } from '../../src/lib/stores.svelte.js'
import {
  initSqlite,
  createDatabase,
  insertFirearm,
  insertRoundCount,
  getRoundCounts,
} from '../../src/lib/db.js'

import RoundCountList from '../../src/components/rounds/RoundCountList.svelte'
import RoundCountForm from '../../src/components/rounds/RoundCountForm.svelte'

await initSqlite()

let db
let firearmId

beforeEach(async () => {
  db = await createDatabase()
  appState.dbInstance = db
  appState.toasts = []
  appState.modalState = null
  markClean()
  closeModal()
  firearmId = insertFirearm(db, { name: 'Test Rifle', serial_number: 'SN-001' })
})

describe('RoundCountList', () => {
  it('renders empty state when no sessions', () => {
    render(RoundCountList, { props: { firearmId, onChanged: null } })
    expect(screen.getByText('No sessions logged yet.')).toBeInTheDocument()
  })

  it('renders one row per session', () => {
    insertRoundCount(db, { firearm_id: firearmId, date: new Date('2024-01-01').getTime(), rounds_fired: 50 })
    insertRoundCount(db, { firearm_id: firearmId, date: new Date('2024-02-01').getTime(), rounds_fired: 75 })
    render(RoundCountList, { props: { firearmId, onChanged: null } })
    expect(screen.getByText('50')).toBeInTheDocument()
    expect(screen.getByText('75')).toBeInTheDocument()
  })

  it('shows correct running total', () => {
    insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 30 })
    insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 20 })
    render(RoundCountList, { props: { firearmId, onChanged: null } })
    expect(screen.getByText('50')).toBeInTheDocument()
  })

  it('clicking Edit opens RoundCountForm pre-populated', async () => {
    insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 10 })
    render(RoundCountList, { props: { firearmId, onChanged: null } })
    await userEvent.click(screen.getByRole('button', { name: 'Edit session' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/Rounds Fired/)).toHaveValue(10)
  })

  it('clicking Delete shows ConfirmModal', async () => {
    insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 10 })
    render(RoundCountList, { props: { firearmId, onChanged: null } })
    await userEvent.click(screen.getByRole('button', { name: 'Delete session' }))
    expect(appState.modalState).not.toBeNull()
  })

  it('confirming delete calls deleteRoundCount and refreshes list', async () => {
    insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 10 })
    render(RoundCountList, { props: { firearmId, onChanged: null } })
    await userEvent.click(screen.getByRole('button', { name: 'Delete session' }))
    appState.modalState.onConfirm()
    await waitFor(() => expect(screen.getByText('No sessions logged yet.')).toBeInTheDocument())
    expect(getRoundCounts(db, firearmId)).toHaveLength(0)
  })
})

describe('RoundCountForm', () => {
  it('shows inline error when rounds_fired is 0', async () => {
    render(RoundCountForm, { props: { firearmId, onClose: vi.fn() } })
    const input = screen.getByLabelText(/Rounds Fired/)
    await userEvent.clear(input)
    await userEvent.type(input, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Add Session' }))
    expect(screen.getByText('Rounds fired must be at least 1.')).toBeInTheDocument()
  })

  it('shows inline error when rounds_fired is negative', async () => {
    render(RoundCountForm, { props: { firearmId, onClose: vi.fn() } })
    const input = screen.getByLabelText(/Rounds Fired/)
    await userEvent.clear(input)
    await userEvent.type(input, '-5')
    await userEvent.click(screen.getByRole('button', { name: 'Add Session' }))
    expect(screen.getByText('Rounds fired must be at least 1.')).toBeInTheDocument()
  })

  it('date field defaults to today', () => {
    render(RoundCountForm, { props: { firearmId, onClose: vi.fn() } })
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(screen.getByLabelText(/Date/)).toHaveValue(expected)
  })

  it('successful create calls insertRoundCount with correct data', async () => {
    const onClose = vi.fn()
    render(RoundCountForm, { props: { firearmId, onClose } })
    const input = screen.getByLabelText(/Rounds Fired/)
    await userEvent.clear(input)
    await userEvent.type(input, '42')
    await userEvent.click(screen.getByRole('button', { name: 'Add Session' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(getRoundCounts(db, firearmId)).toHaveLength(1)
    expect(getRoundCounts(db, firearmId)[0].rounds_fired).toBe(42)
  })

  it('successful edit calls updateRoundCount with correct data', async () => {
    const id = insertRoundCount(db, { firearm_id: firearmId, date: Date.now(), rounds_fired: 10 })
    const roundCount = { id, firearm_id: firearmId, date: Date.now(), rounds_fired: 10, notes: null }
    const onClose = vi.fn()
    render(RoundCountForm, { props: { firearmId, roundCount, onClose } })
    const input = screen.getByLabelText(/Rounds Fired/)
    await userEvent.clear(input)
    await userEvent.type(input, '99')
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(getRoundCounts(db, firearmId)[0].rounds_fired).toBe(99)
  })

  it('calls onClose after successful submit', async () => {
    const onClose = vi.fn()
    render(RoundCountForm, { props: { firearmId, onClose } })
    const input = screen.getByLabelText(/Rounds Fired/)
    await userEvent.clear(input)
    await userEvent.type(input, '15')
    await userEvent.click(screen.getByRole('button', { name: 'Add Session' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stores date as local midnight, not UTC midnight', async () => {
    const onClose = vi.fn()
    render(RoundCountForm, { props: { firearmId, onClose } })
    fireEvent.input(screen.getByLabelText(/Date/), { target: { value: '2024-03-15' } })
    const input = screen.getByLabelText(/Rounds Fired/)
    await userEvent.clear(input)
    await userEvent.type(input, '10')
    await userEvent.click(screen.getByRole('button', { name: 'Add Session' }))
    const stored = getRoundCounts(db, firearmId)[0]
    const d = new Date(stored.date)
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(2) // 0-indexed: March = 2
    expect(d.getDate()).toBe(15)
  })
})
