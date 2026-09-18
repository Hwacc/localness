/**
 * `navigator.clipboard` only exists in a secure context (HTTPS or localhost).
 * Intranet Docker is typically `http://host:port`, so writeText rejects with
 * no useful console output. The textarea fallback still works there.
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
  copyViaTextarea(text)
}

function copyViaTextarea(text: string) {
  const el = document.createElement('textarea')
  el.value = text
  el.setAttribute('readonly', '')
  el.style.position = 'fixed'
  el.style.left = '-9999px'
  document.body.appendChild(el)
  el.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(el)
  if (!ok) throw new Error('Copy failed')
}
