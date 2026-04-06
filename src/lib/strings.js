export const strings = {
  empty: {
    firearms:  'No firearms yet.',
    rounds:    'No sessions logged yet.',
    events:    'No events recorded yet.',
    documents: 'No documents.',
  },
  errors: {
    duplicateSerial:    'A firearm with this serial number already exists.',
    nameRequired:       'Name is required.',
    serialRequired:     'Serial number is required.',
    titleRequired:      'Title is required.',
    roundsMin:          'Rounds fired must be at least 1.',
    fileRequired:       'Please select a file.',
    fatalOpen:          'Could not open database. The file may be corrupt or not a valid SQLite database.',
    missingDb:          'No database specified. Use --db <path> or set "db" in ~/.fdbrc.',
    configMalformed:    'Warning: ~/.fdbrc could not be parsed as JSON. Ignoring config defaults.',
  },
  confirm: {
    deleteFirearm: (rounds, events, docs) =>
      `This will permanently delete ${rounds} round count session${rounds !== 1 ? 's' : ''} and ${events} event${events !== 1 ? 's' : ''}, and unlink ${docs} document${docs !== 1 ? 's' : ''}. This cannot be undone.`,
    deleteRound:    'Delete this round count session? This cannot be undone.',
    deleteEvent:    'Delete this event? This cannot be undone.',
    deleteDocument: 'Delete this document? It will be removed from all associated firearms. This cannot be undone.',
    unlinkDocument: 'Unlink this document from this firearm? The document will remain in your library.',
  },
  toasts: {
    saved:            'Database saved.',
    firearmAdded:     'Firearm added.',
    firearmUpdated:   'Firearm updated.',
    firearmDeleted:   'Firearm deleted.',
    roundAdded:       'Session added.',
    roundUpdated:     'Session updated.',
    roundDeleted:     'Session deleted.',
    eventAdded:       'Event added.',
    eventUpdated:     'Event updated.',
    eventDeleted:     'Event deleted.',
    documentUploaded: 'Document uploaded.',
    documentDeleted:  'Document deleted.',
    documentUnlinked: 'Document unlinked.',
  },
  chart: {
    // date-fns format string for chartjs-adapter-date-fns axis labels.
    // Separate from fromEpoch(), which uses toLocaleDateString() for table/UI display.
    dateFormat:  'MMM d, yyyy',
    noDataLabel: 'No rounds logged yet.',
    yAxisLabel:  'Cumulative Rounds',
  },
  landing: {
    description: 'A personal firearms database that runs entirely in your browser. Your data lives in a file on your machine — nothing is sent to any server, ever.',
    verifyLinkText: 'Verify it yourself.',
    verifyLinkUrl:  'https://github.com/marshha/fdb',
  },
  firefox: {
    saveWarning: 'Your browser does not support in-place file saving. Each save will download a new copy of your database.',
  },
  titles: {
    base:       'FDB',
    withFile:   (filename) => `FDB — ${filename}`,
    unsaved:    'FDB — unsaved',
  },
}
