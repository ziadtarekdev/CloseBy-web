// Every sentence the public page shows.
//
// Nothing here is a Firebase error code, and no code is ever concatenated into
// these strings — the translation happens in publicProfile.js and geolocation.js
// so a finder only ever reads plain language.

export const copy = {
  brand: 'CloseBy',
  tagline: 'Every child, safely home.',

  loading: 'Opening the child record…',

  invalidLinkTitle: 'This link is not complete',
  invalidLinkBody:
    'This page needs the full link from the child’s QR code. Please scan the code again.',
  notFoundTitle: 'This code is no longer active',
  notFoundBody:
    'The QR code for this child was replaced or removed. Please ask the nursery for an up-to-date code.',
  errorTitle: 'We could not open this page',
  errorBody:
    'Check your connection and scan the code again, or tell a member of nursery staff.',

  ageLabel: (years) => `${years} yrs`,
  unknownChild: 'Child',
  notesTitle: 'Note for whoever finds them',
  nurseryTitle: 'Nursery',

  contactNursery: 'Contact nursery',
  callNursery: (phone) => `Call ${phone}`,
  groupLabel: 'Group / class',

  detailsTitle: 'Child details',
  guardianNameLabel: 'Guardian',
  guardianPhoneLabel: 'Guardian phone',
  callGuardian: (phone) => `Call guardian ${phone}`,

  reportTitle: 'Tell the nursery',
  reportIntro:
    'The nursery already knows this code was scanned. If the child is alone or lost, raise the alarm.',
  reportIdle: 'This child is lost',
  reportFormTitle: 'Report a lost child',
  reportCommentLabel: 'Comment for the nursery (optional)',
  reportCommentPlaceholder: 'Where you are, what the child is wearing, anything that helps…',
  // Said before the browser's own prompt appears, so a finder is not surprised
  // by it — and knows that saying no still sends the alert.
  reportLocationAsk:
    'Your browser will ask to share your location with the nursery. Saying no still sends the alert.',
  reportSubmit: 'Send alert',
  reportCancel: 'Cancel',
  reportLocating: 'Getting your location…',
  reportLocatingHint:
    'If your browser asks to use your location, tap Allow. Blocking it still sends the report.',
  reportSending: 'Sending…',
  reportSendingHint: 'Sending the report to the nursery…',
  reportSuccessTitle: 'Thank you',
  reportSuccessBody:
    'The nursery has been notified. Someone will come to you — please stay with them.',
  reportSuccessNoLocation:
    'The nursery has been notified, but your location could not be read. Please stay where you are.',
  reportSentAt: (time) => `Sent at ${time}`,
  reportWithLocation: 'Your location was shared',
  reportWithoutLocation: 'Sent without your location',
  reportFailedTitle: 'The report was not sent',
  reportFailed: 'The report could not be sent. Please tell a member of nursery staff directly.',
  reportFailedCall: 'Or call the nursery now:',
  reportRetry: 'Try again',
  // Shown while the write is still waiting for the server — on a slow or
  // dropped connection Firestore keeps retrying, and the page must not say
  // "sent" until it has actually been accepted.
  reportSlow:
    'Still sending — your connection is slow. Keep this page open; it will finish on its own when the connection returns.',
  // A report already sent from this phone for this child, remembered for a
  // while so a reload does not look like nothing was sent.
  reportAlreadySent: (time) => `You already told the nursery at ${time}.`,
  reportSendUpdate: 'Send an update',
  reportUpdateHint: 'Sends a new alert with your current location and comment.',

  privacyNote:
    'Only your approximate location is shared, and only with this nursery.',
  exitTitle: 'What to do now',
  // The "call" step only points at a button when there is one: the page shows
  // "Contact nursery" only for a profile that carries a public nursery phone.
  exitSteps: (canCallNursery) => [
    'Stay with the child somewhere safe.',
    canCallNursery
      ? 'Call the nursery using the button above.'
      : 'Tap “This child is lost” so the nursery knows where to look.',
    'Do not take the child anywhere on your own.',
  ],

  // ── Home: opened without a code ────────────────────────────────────────
  homeTitle: 'Found a child wearing a CloseBy code?',
  homeBody:
    'Scan the QR code on their clothing or badge. Their nursery’s page opens, and the nursery is told the code was scanned.',
  homeCameraTitle: 'Use your phone’s camera',
  homeCameraBody:
    'Open the camera app, point it at the code and tap the link that appears. No app to install.',
  homeSteps: [
    { icon: 'camera', text: 'Open your phone’s camera app.' },
    { icon: 'qr', text: 'Point it at the QR code on the child’s clothing or badge.' },
    { icon: 'tap', text: 'Tap the link that appears. The nursery’s page opens.' },
  ],
  homeNoApp: 'No app to install, no account needed.',
  homeScanTitle: 'Scan here',
  homePasteTitle: 'Or paste the link',
  homePasteLabel: 'Link from the QR code',
  homePastePlaceholder: 'https://closeby-28cdc.web.app/child?…',
  homePasteSubmit: 'Open',
  homePasteHint: 'Only links to a CloseBy child page will open.',
  homePasteEmpty: 'Paste the link from the child’s QR code first.',
  homePasteInvalid:
    'That is not a CloseBy child link. Check that you copied the whole link from the code.',
  homeSafetyTitle: 'Stay with the child',
  homeSafetyBody:
    'Keep them somewhere safe and visible. Do not take them anywhere on your own.',

  scanStart: 'Scan a QR code',
  scanRetry: 'Try the camera again',
  scanCancel: 'Stop scanning',
  scanVideoLabel: 'Camera view for scanning the QR code',
  scanStatus: {
    idle: '',
    starting: 'Starting the camera…',
    scanning: 'Point the camera at the QR code.',
    notCloseBy: 'That QR code is not a CloseBy code. Try the one on the child’s clothing or badge.',
    found: 'Code found. Opening the child’s page…',
    denied: 'Camera access was blocked. Allow the camera for this site, or use your camera app instead.',
    noCamera: 'No camera could be started on this device. Use your camera app or paste the link.',
    unsupported: 'This browser cannot scan codes. Use your camera app or paste the link.',
  },

  scanAnother: 'Scan a code',
  notFoundPageTitle: 'This page does not exist',
  notFoundPageBody: 'The link may be mistyped. Scan the child’s QR code again to open their page.',

  footer: 'CloseBy helps nurseries reunite children who have become separated from their group.',
};