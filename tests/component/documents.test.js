import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/svelte'
import userEvent from '@testing-library/user-event'
import { appState, closeModal, markClean } from '../../src/lib/stores.svelte.js'
import {
  initSqlite,
  createDatabase,
  insertFirearm,
  insertDocument,
  linkDocumentToFirearm,
  getDocumentsForFirearm,
  getAllDocuments,
} from '../../src/lib/db.js'

import DocumentList from '../../src/components/documents/DocumentList.svelte'
import DocumentUpload from '../../src/components/documents/DocumentUpload.svelte'

await initSqlite()

let db
let firearmId

function makeDoc(overrides = {}) {
  return {
    filename: 'test.pdf',
    fileData: new Uint8Array([1, 2, 3]),
    mimeType: 'application/pdf',
    docType: 'Receipt',
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

describe('DocumentList', () => {
  it('renders empty state when no documents', () => {
    render(DocumentList, { props: { firearmId: null } })
    expect(screen.getByText('No documents.')).toBeInTheDocument()
  })

  it('renders one row per document', () => {
    const docId = insertDocument(db, makeDoc({ filename: 'manual.pdf' }))
    insertDocument(db, makeDoc({ filename: 'receipt.pdf' }))
    render(DocumentList, { props: { firearmId: null } })
    expect(screen.getByText('manual.pdf')).toBeInTheDocument()
    expect(screen.getByText('receipt.pdf')).toBeInTheDocument()
  })

  it('Delete in per-firearm view calls unlinkDocumentFromFirearm (not deleteDocument)', async () => {
    const docId = insertDocument(db, makeDoc({ filename: 'linked.pdf' }))
    linkDocumentToFirearm(db, docId, firearmId, null)
    render(DocumentList, { props: { firearmId } })
    await userEvent.click(screen.getByRole('button', { name: /Unlink/ }))
    // Should show confirm modal
    expect(appState.modalState).not.toBeNull()
    appState.modalState.onConfirm()
    // After unlinking, the per-firearm list should be empty but global docs still exist
    await waitFor(() => expect(screen.getByText('No documents.')).toBeInTheDocument())
    expect(getAllDocuments(db)).toHaveLength(1)
    expect(getDocumentsForFirearm(db, firearmId)).toHaveLength(0)
  })

  it('Delete in global view calls deleteDocument', async () => {
    insertDocument(db, makeDoc({ filename: 'todelete.pdf' }))
    render(DocumentList, { props: { firearmId: null } })
    await userEvent.click(screen.getByRole('button', { name: /Delete todelete/ }))
    expect(appState.modalState).not.toBeNull()
    appState.modalState.onConfirm()
    await waitFor(() => expect(screen.getByText('No documents.')).toBeInTheDocument())
    expect(getAllDocuments(db)).toHaveLength(0)
  })
})

describe('DocumentUpload', () => {
  it('submit button is disabled when no file selected', () => {
    render(DocumentUpload, { props: { onClose: vi.fn() } })
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled()
  })

  it('successful upload calls insertDocument with correct filename and mime_type', async () => {
    const onClose = vi.fn()
    render(DocumentUpload, { props: { onClose } })
    const file = new File(['content'], 'test-upload.pdf', { type: 'application/pdf' })
    const fileInput = screen.getByLabelText(/File/)
    await userEvent.upload(fileInput, file)
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(onClose).toHaveBeenCalledOnce()
    const docs = getAllDocuments(db)
    expect(docs).toHaveLength(1)
    expect(docs[0].filename).toBe('test-upload.pdf')
    expect(docs[0].mime_type).toBe('application/pdf')
  })

  it('links document to pre-selected firearmId on submit', async () => {
    const onClose = vi.fn()
    render(DocumentUpload, { props: { firearmId, onClose } })
    const file = new File(['content'], 'linked.pdf', { type: 'application/pdf' })
    const fileInput = screen.getByLabelText(/File/)
    await userEvent.upload(fileInput, file)
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(getDocumentsForFirearm(db, firearmId)).toHaveLength(1)
  })
})
