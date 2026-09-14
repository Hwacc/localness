/**
 * Inline placeholders for `v-oss-image`.
 *
 * These used to be remote (`http://iph.href.lu/...`), which failed twice over: a
 * network that blocks the host turned every slow or broken image into a *second*
 * broken image, and on an https origin the browser refused the request outright
 * as mixed content. A data URI cannot fail, needs no request, and works offline.
 */

const WIDTH = 600
const HEIGHT = 400

function svgPlaceholder(label: string, fill: string) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">` +
    `<rect width="100%" height="100%" fill="#1f2937"/>` +
    `<text x="50%" y="50%" fill="${fill}" font-family="system-ui, sans-serif" font-size="24"` +
    ` text-anchor="middle" dominant-baseline="middle">${label}</text>` +
    `</svg>`
  // percent-encoded rather than base64: stays readable in devtools, and it
  // escapes the `#` in the colours, which would otherwise start a URL fragment
  // and truncate the image.
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const IMAGE_LOADING_PLACEHOLDER = svgPlaceholder('Loading…', '#9ca3af')
export const IMAGE_ERROR_PLACEHOLDER = svgPlaceholder(
  'Image unavailable',
  '#f87171'
)
