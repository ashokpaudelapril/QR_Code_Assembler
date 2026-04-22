/**
 * OmniQR Generator Schema Definitions
 * Standard formats for various QR types
 */

export const QR_SCHEMAS = {
  URL: {
    label: 'Website URL',
    icon: '🌐',
    fields: [
      { id: 'url', label: 'URL', type: 'url', placeholder: 'https://example.com' }
    ],
    format: (f) => f.url
  },
  WIFI: {
    label: 'WiFi Network',
    icon: '📶',
    fields: [
      { id: 'ssid', label: 'Network Name (SSID)', type: 'text', placeholder: 'My Home WiFi' },
      { id: 'type', label: 'Encryption', type: 'select', options: ['WPA', 'WEP', 'nopass'] },
      { id: 'password', label: 'Password', type: 'password', placeholder: '••••••••' },
      { id: 'hidden', label: 'Hidden Network', type: 'checkbox' }
    ],
    format: (f) => `WIFI:S:${f.ssid};T:${f.type};P:${f.password};H:${f.hidden ? 'true' : ''};;`
  },
  VCARD: {
    label: 'Contact Card',
    icon: '👤',
    fields: [
      { id: 'fn', label: 'Full Name', type: 'text', placeholder: 'Ashok Paudel' },
      { id: 'org', label: 'Organization', type: 'text', placeholder: 'OmniQR Inc.' },
      { id: 'tel', label: 'Phone Number', type: 'tel', placeholder: '+1 234 567 8900' },
      { id: 'email', label: 'Email Address', type: 'email', placeholder: 'ashok@example.com' },
      { id: 'url', label: 'Website', type: 'url', placeholder: 'https://ashok.dev' }
    ],
    format: (f) => `BEGIN:VCARD\nVERSION:3.0\nFN:${f.fn}\nORG:${f.org}\nTEL:${f.tel}\nEMAIL:${f.email}\nURL:${f.url}\nEND:VCARD`
  },
  EVENT: {
    label: 'Calendar Event',
    icon: '📅',
    fields: [
      { id: 'summary', label: 'Event Title', type: 'text', placeholder: 'Product Launch' },
      { id: 'location', label: 'Location', type: 'text', placeholder: 'San Francisco' },
      { id: 'start', label: 'Start Date/Time', type: 'datetime-local' },
      { id: 'end', label: 'End Date/Time', type: 'datetime-local' }
    ],
    format: (f) => {
      const ts = (d) => d.replace(/[-:]/g, '').split('.')[0] + 'Z';
      return `BEGIN:VEVENT\nSUMMARY:${f.summary}\nLOCATION:${f.location}\nDTSTART:${ts(f.start)}\nDTEND:${ts(f.end)}\nEND:VEVENT`;
    }
  },
  SMS: {
    label: 'SMS Message',
    icon: '💬',
    fields: [
      { id: 'tel', label: 'Phone Number', type: 'tel', placeholder: '+1 234 567 8900' },
      { id: 'body', label: 'Message Text', type: 'textarea', placeholder: 'Hello!' }
    ],
    format: (f) => `smsto:${f.tel}:${f.body}`
  },
  EMAIL: {
    label: 'Email Template',
    icon: '📧',
    fields: [
      { id: 'email', label: 'Recipient Email', type: 'email', placeholder: 'contact@example.com' },
      { id: 'subject', label: 'Subject', type: 'text', placeholder: 'Inquiry' },
      { id: 'body', label: 'Body Text', type: 'textarea', placeholder: 'I am interested in...' }
    ],
    format: (f) => `mailto:${f.email}?subject=${encodeURIComponent(f.subject)}&body=${encodeURIComponent(f.body)}`
  },
  BANK_CARD: {
    label: 'Bank Card',
    icon: '💳',
    fields: [
      { id: 'holder', label: 'Cardholder Name', type: 'text', placeholder: 'John Doe' },
      { id: 'number', label: 'Card Number', type: 'text', placeholder: '0000 0000 0000 0000' },
      { id: 'expiry', label: 'Expiry (MM/YY)', type: 'text', placeholder: '12/26' },
      { id: 'network', label: 'Network', type: 'select', options: ['Visa', 'Mastercard', 'Amex', 'Discover'] }
    ],
    format: (f) => `OMNIQR:CARD:H:${f.holder};N:${f.number};E:${f.expiry};W:${f.network};;`
  },
  DYNAMIC_URL: {
    label: 'Dynamic URL',
    icon: '🚀',
    fields: [
      { id: 'targetUrl', label: 'Target URL', type: 'url', placeholder: 'https://any-link.com' }
    ],
    format: (f) => f.targetUrl,
    isDynamic: true
  },
  SMART_ASSET: {
    label: 'Smart Cloud Asset',
    icon: '🖼️',
    fields: [
      { id: 'document', label: 'Select PDF or Image', type: 'file', accept: '.pdf,.png,.jpg,.jpeg' }
    ]
  }
};
