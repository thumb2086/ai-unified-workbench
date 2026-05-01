// Use require for CommonJS compatibility
const { session } = require('electron')

// Headers that block embedding in webview
const BLOCKING_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'x-content-type-options',
]

// Type definitions
type Session = ReturnType<typeof session.fromPartition>
type WebContents = any
type Permission = 
  | 'clipboard-read'
  | 'clipboard-sanitized-write'
  | 'geolocation'
  | 'media'
  | 'mediaKeySystem'
  | 'midi'
  | 'midiSysex'
  | 'notifications'
  | 'pointerLock'
  | 'display-capture'
  | 'fullscreen'

/**
 * Configure a session partition to allow AI sites to be embedded in webviews
 */
export function configureSessionPartition(partition: string): Session {
  const sess: Session = session.fromPartition(partition)

  // Remove X-Frame-Options and other embedding restrictions
  sess.webRequest.onHeadersReceived((details: any, callback: any) => {
    const responseHeaders: Record<string, string[]> = {}

    // Filter out blocking headers
    for (const [key, value] of Object.entries(details.responseHeaders || {})) {
      if (!BLOCKING_HEADERS.includes(key.toLowerCase())) {
        // Ensure value is string array
        responseHeaders[key] = Array.isArray(value) ? value as string[] : [String(value)]
      }
    }

    callback({
      cancel: false,
      responseHeaders,
      statusLine: details.statusLine
    })
  })

  // Configure permissive permissions for AI sites
  sess.setPermissionRequestHandler((wc: WebContents, permission: Permission, callback: (allow: boolean) => void) => {
    // Allow notifications, media, etc. for AI sites
    const allowedPermissions: Permission[] = [
      'notifications',
      'media',
      'geolocation',
      'clipboard-sanitized-write',
      'clipboard-read'
    ]
    callback(allowedPermissions.includes(permission))
  })

  // Set user agent to appear as regular browser
  sess.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  )

  return sess
}

/**
 * Generate a unique partition name for each webview slot
 */
export function generatePartition(slotId: string): string {
  return `persist:webview-${slotId}`
}

/**
 * Clear all session data for a partition (logout)
 */
export async function clearSession(partition: string): Promise<void> {
  const sess = session.fromPartition(partition)
  await sess.clearStorageData()
  await sess.clearCache()
}

/**
 * Get all active partitions
 */
export function getActivePartitions(): string[] {
  const partitions: string[] = []
  // Get all sessions including default
  const availableSessions = session.availableSessions
  if (availableSessions) {
    for (const name of availableSessions) {
      partitions.push(name)
    }
  }
  return partitions
}
