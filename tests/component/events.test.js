import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { appState, closeModal, markClean } from '../../src/lib/stores.svelte.js'
import {
  initSqlite,
  createDatabase,
  insertFirearm,
  insertEvent,
  getEvents,
  updateEvent,
  toEpoch,
} from '../../src/lib/db.js'

import EventList from '../../src/components/events/EventList.svelte'
import EventForm from '../../src/components/events/EventForm.svelte'

await initSqlite()

let db
let firearmId

function makeEvent(overrides = {}) {
  return {
    firearm_id: firearmId,
    event_type: 'Maintenance',
    date: new Date('2024-03-15').getTime(),
    title: 'Oil change',
    description: 'Cleaned and oiled',
    ...overrides,
  }
}

beforeEach(async () => {
  db = await createDatabase()
  appState.dbInstance = db
  appState.toasts = []
  appState.modalState = null
  markClean()
  closeModal()
  firearmId = insertFirearm(db, { name: 'Test Rifle', serial_number: 'SN-001' })
})

describe('EventList', () => {
  it('renders empty state when no events', () => {
    render(EventList, { props: { firearmId } })
    expect(screen.getByText('No events recorded yet.')).toBeInTheDocument()
  })

  it('renders one row per event', () => {
    insertEvent(db, makeEvent({ title: 'First event' }))
    insertEvent(db, makeEvent({ title: 'Second event' }))
    render(EventList, { props: { firearmId } })
    expect(screen.getByText('First event')).toBeInTheDocument()
    expect(screen.getByText('Second event')).toBeInTheDocument()
  })

  it('rows are in date descending order', () => {
    insertEvent(db, makeEvent({ title: 'Earlier', date: new Date('2024-01-01').getTime() }))
    insertEvent(db, makeEvent({ title: 'Later', date: new Date('2024-12-31').getTime() }))
    render(EventList, { props: { firearmId } })
    const rows = screen.getAllByRole('row')
    // First data row (index 1) should be the later date (desc order)
    expect(rows[1]).toHaveTextContent('Later')
    expect(rows[2]).toHaveTextContent('Earlier')
  })

  it('clicking Edit opens EventForm pre-populated', async () => {
    insertEvent(db, makeEvent({ title: 'My Event' }))
    render(EventList, { props: { firearmId } })
    await userEvent.click(screen.getByRole('button', { name: /Edit event My Event/ }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText(/Title/)).toHaveValue('My Event')
  })

  it('confirming Delete calls deleteEvent and refreshes list', async () => {
    insertEvent(db, makeEvent({ title: 'ToDelete' }))
    render(EventList, { props: { firearmId } })
    await userEvent.click(screen.getByRole('button', { name: /Delete event ToDelete/ }))
    expect(appState.modalState).not.toBeNull()
    appState.modalState.onConfirm()
    await waitFor(() => expect(screen.getByText('No events recorded yet.')).toBeInTheDocument())
    expect(getEvents(db, firearmId)).toHaveLength(0)
  })
})

describe('EventForm', () => {
  it('shows inline error when Title is empty', async () => {
    render(EventForm, { props: { firearmId, onClose: vi.fn() } })
    await userEvent.click(screen.getByRole('button', { name: 'Add Event' }))
    expect(screen.getByText('Title is required.')).toBeInTheDocument()
  })

  it('created_at is not an editable field', () => {
    render(EventForm, { props: { firearmId, onClose: vi.fn() } })
    // There should be no label or input for created_at
    expect(screen.queryByLabelText(/created/i)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue(/created_at/i)).not.toBeInTheDocument()
  })

  it('successful create calls insertEvent with correct data', async () => {
    const onClose = vi.fn()
    render(EventForm, { props: { firearmId, onClose } })
    await userEvent.type(screen.getByLabelText(/Title/), 'Cleaned bore')
    await userEvent.click(screen.getByRole('button', { name: 'Add Event' }))
    expect(onClose).toHaveBeenCalledOnce()
    const events = getEvents(db, firearmId)
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('Cleaned bore')
  })

  it('successful edit calls updateEvent with correct data', async () => {
    const id = insertEvent(db, makeEvent({ title: 'Old title' }))
    const ev = { id, firearm_id: firearmId, event_type: 'Maintenance', date: new Date('2024-03-15').getTime(), title: 'Old title', description: null, created_at: Date.now() }
    const onClose = vi.fn()
    render(EventForm, { props: { firearmId, event: ev, onClose } })
    const titleInput = screen.getByLabelText(/Title/)
    await userEvent.clear(titleInput)
    await userEvent.type(titleInput, 'New title')
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(getEvents(db, firearmId)[0].title).toBe('New title')
  })

  it('calls onClose after successful submit', async () => {
    const onClose = vi.fn()
    render(EventForm, { props: { firearmId, onClose } })
    await userEvent.type(screen.getByLabelText(/Title/), 'Test event')
    await userEvent.click(screen.getByRole('button', { name: 'Add Event' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
