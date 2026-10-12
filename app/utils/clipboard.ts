/**
 * `navigator.clipboard` only exists in a secure context (HTTPS or localhost).
 * Intranet Docker is typically `http://host:port`, so writeText rejects with
 * no useful console output. The DOM-selection fallback still works there.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof window !== 'undefined' && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Fall through: some browsers expose clipboard but still refuse it.
    }
  }
  copyViaDomSelection(text)
}

// Must not move focus: a modal's focus trap yanks focus back the instant a
// textarea's select() steals it, and execCommand then copies the empty
// document selection while still returning true. A Range over an off-screen
// element selects without touching focus, so the trap never fires.
function copyViaDomSelection(text: string) {
  const el = document.createElement('pre')
  el.textContent = text
  el.style.position = 'fixed'
  el.style.left = '-9999px'
  document.body.appendChild(el)
  try {
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    if (!selection) throw new Error('Copy failed')
    selection.removeAllRanges()
    selection.addRange(range)
    if (!document.execCommand('copy')) throw new Error('Copy failed')
    selection.removeAllRanges()
  } finally {
    document.body.removeChild(el)
  }
}
