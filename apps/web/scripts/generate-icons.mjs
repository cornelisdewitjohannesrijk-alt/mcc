/**
 * Generates PWA icons (192x192 and 512x512 PNG) using @vercel/og / satori.
 * Run once: node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public', 'icons')

// Minimal valid PNG: green square with rounded feel
// We'll generate these using canvas if available, otherwise create placeholder SVGs
// converted to PNG-compatible format

async function generateIcon(size) {
  // Try to use canvas if available
  try {
    const { createCanvas } = await import('canvas')
    const canvas = createCanvas(size, size)
    const ctx = canvas.getContext('2d')

    // Background
    const radius = size * 0.18
    ctx.beginPath()
    ctx.moveTo(radius, 0)
    ctx.lineTo(size - radius, 0)
    ctx.quadraticCurveTo(size, 0, size, radius)
    ctx.lineTo(size, size - radius)
    ctx.quadraticCurveTo(size, size, size - radius, size)
    ctx.lineTo(radius, size)
    ctx.quadraticCurveTo(0, size, 0, size - radius)
    ctx.lineTo(0, radius)
    ctx.quadraticCurveTo(0, 0, radius, 0)
    ctx.closePath()
    ctx.fillStyle = '#075e54'
    ctx.fill()

    // Chat bubble
    const bw = size * 0.6
    const bh = size * 0.55
    const bx = (size - bw) / 2
    const by = (size - bh) / 2 - size * 0.03
    const br = size * 0.14

    ctx.beginPath()
    ctx.moveTo(bx + br, by)
    ctx.lineTo(bx + bw - br, by)
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br)
    ctx.lineTo(bx + bw, by + bh - br)
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh)
    ctx.lineTo(bx + br + size * 0.08, by + bh)
    ctx.lineTo(bx + size * 0.04, by + bh + size * 0.1)
    ctx.lineTo(bx + size * 0.04, by + bh - br)
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br)
    ctx.lineTo(bx, by + br)
    ctx.quadraticCurveTo(bx, by, bx + br, by)
    ctx.closePath()
    ctx.fillStyle = '#25d366'
    ctx.fill()

    // Lines inside bubble
    ctx.fillStyle = 'white'
    const lh = size * 0.045
    const lw = size * 0.32
    const lx = bx + bw * 0.2
    const gap = size * 0.075
    const ly = by + bh * 0.28

    for (let i = 0; i < 3; i++) {
      const w = i === 2 ? lw * 0.7 : lw
      ctx.beginPath()
      ctx.roundRect(lx, ly + i * gap, w, lh, lh / 2)
      ctx.fill()
    }

    return canvas.toBuffer('image/png')
  } catch {
    console.log('canvas not available — using SVG fallback for icons')
    return null
  }
}

async function run() {
  if (!existsSync(publicDir)) await mkdir(publicDir, { recursive: true })

  for (const size of [192, 512]) {
    const buffer = await generateIcon(size)
    if (buffer) {
      await writeFile(path.join(publicDir, `icon-${size}.png`), buffer)
      console.log(`✓ Generated icon-${size}.png`)
    } else {
      // Write SVG as fallback — rename to .png so manifest reference works
      // (Chrome accepts SVG named as PNG in some cases; replace with real PNGs for production)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="#075e54"/>
  <rect x="${size*0.2}" y="${size*0.22}" width="${size*0.6}" height="${size*0.5}" rx="${size*0.1}" fill="#25d366"/>
  <rect x="${size*0.3}" y="${size*0.36}" width="${size*0.4}" height="${size*0.06}" rx="${size*0.03}" fill="white"/>
  <rect x="${size*0.3}" y="${size*0.46}" width="${size*0.4}" height="${size*0.06}" rx="${size*0.03}" fill="white"/>
  <rect x="${size*0.3}" y="${size*0.56}" width="${size*0.25}" height="${size*0.06}" rx="${size*0.03}" fill="white"/>
</svg>`
      await writeFile(path.join(publicDir, `icon-${size}.png`), svg)
      console.log(`✓ Generated icon-${size}.png (SVG fallback)`)
    }
  }
}

run().catch(console.error)
