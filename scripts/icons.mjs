// Emits icon-192.png / icon-512.png. Hand-rolled PNG writer so the icons
// need no image library: solid dark square with a white "page" glyph.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const px = (x, y) => {
    const u = x / size
    const v = y / size
    // Page: white rounded rect, 54% wide, 68% tall, plus three grey lines.
    const inPage = u > 0.3 && u < 0.7 && v > 0.18 && v < 0.82
    const folded = u > 0.58 && v < 0.18 + (u - 0.58) * 1.2
    const line = [0.28, 0.4, 0.52].some((ly) => Math.abs(v - ly) < 0.015 && u > 0.36 && u < 0.64)
    if (inPage && !folded && line) return [15, 23, 42]
    if (inPage && !folded) return [248, 250, 252]
    return [15, 23, 42]
  }
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      const [r, g, b] = px(x, y)
      const o = row + 1 + x * 4
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
      raw[o + 3] = 255
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

for (const s of [192, 512]) writeFileSync(new URL(`../public/icon-${s}.png`, import.meta.url), png(s))
console.log('icons written')