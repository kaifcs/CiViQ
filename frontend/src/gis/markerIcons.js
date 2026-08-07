// Leaflet icon builders, kept apart from the layer components so every layer
// reuses the same marker vocabulary. divIcons with inline styles need no image
// assets and sidestep Leaflet's bundler icon-path problem.

import L from "leaflet"

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c])

// Circular marker in the supplied colour. `selected` adds a halo instead of
// changing hue, so the status colour stays readable while selected.
export function createDotIcon({ color, size = 14, selected = false }) {
  const ring = selected ? `0 0 0 4px ${color}59` : "0 1px 3px rgba(0,0,0,0.35)"

  return L.divIcon({
    className: "civiq-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
    html:
      `<span style="display:block;width:${size}px;height:${size}px;border-radius:50%;` +
      `background:${escapeHtml(color)};border:2px solid #FFFFFF;box-sizing:border-box;` +
      `box-shadow:${ring};"></span>`,
  })
}

// Rounded-square marker carrying a single-path SVG glyph. The square silhouette
// distinguishes glyph layers from the round dot markers at a glance. `glyph` is
// 24x24 path data; `muted` dims records that no longer need attention.
export function createGlyphIcon({ color, size = 22, glyph, selected = false, muted = false }) {
  const ring = selected ? `0 0 0 4px ${color}59` : "0 1px 3px rgba(0,0,0,0.35)"
  const inner = Math.round(size * 0.62)

  return L.divIcon({
    className: "civiq-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
    html:
      `<span style="display:flex;align-items:center;justify-content:center;` +
      `width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.3)}px;` +
      `box-sizing:border-box;background:${escapeHtml(color)};border:2px solid #FFFFFF;` +
      `box-shadow:${ring};opacity:${muted ? 0.55 : 1};">` +
      `<svg width="${inner}" height="${inner}" viewBox="0 0 24 24" fill="none" ` +
      `stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="${escapeHtml(glyph)}"/></svg></span>`,
  })
}

// Cluster badge sized by how many markers it swallows. Rendered in the brand
// accent so a cluster never reads as a status colour.
export function createClusterIcon(count, { accent = "#5E6AD2" } = {}) {
  const size = count < 10 ? 32 : count < 100 ? 38 : 44

  return L.divIcon({
    className: "civiq-cluster",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html:
      `<span style="display:flex;align-items:center;justify-content:center;` +
      `width:${size}px;height:${size}px;border-radius:50%;box-sizing:border-box;` +
      `background:${accent}E6;border:2px solid #FFFFFF;color:#FFFFFF;` +
      `font-family:'Inter',sans-serif;font-size:${count < 100 ? 13 : 12}px;font-weight:700;` +
      `box-shadow:0 2px 6px rgba(0,0,0,0.3);">${escapeHtml(count)}</span>`,
  })
}

export { escapeHtml }
