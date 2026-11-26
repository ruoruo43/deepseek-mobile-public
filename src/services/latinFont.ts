import { openDB } from 'idb'

const fontFamily = 'DS Local Latin'
const unicodeRange = 'U+0000-024F,U+0300-03FF,U+1E00-1EFF,U+2000-214F,U+2190-22FF'
const maxFontBytes = 8 * 1024 * 1024
const store = 'fonts'
const fontKey = 'latin'
let currentFace: FontFace | undefined

const openFontDb = () =>
  openDB('ds-mobile-appearance', 1, {
    upgrade: (db) => db.createObjectStore(store),
  })

const loadFace = (font: Blob) => {
  if (font.size < 12 || font.size > maxFontBytes) {
    throw new Error('Invalid font size')
  }
  return font
    .arrayBuffer()
    .then((buffer) => new FontFace(fontFamily, buffer, { unicodeRange }).load())
}

const applyFace = (face?: FontFace) => {
  if (currentFace) {
    document.fonts.delete(currentFace)
  }
  if (face) {
    document.fonts.add(face)
  }
  currentFace = face
}

export async function restoreLocalLatinFont(): Promise<boolean> {
  const db = await openFontDb()
  try {
    const font: unknown = await db.get(store, fontKey)
    if (!(font instanceof Blob)) {
      return false
    }
    applyFace(await loadFace(font))
    return true
  } finally {
    db.close()
  }
}

export async function saveLocalLatinFont(file: File | null) {
  if (file && !/\.(ttf|otf)$/i.test(file.name)) {
    throw new Error('Invalid font file')
  }
  const font = file?.slice()
  const face = font && (await loadFace(font))
  const db = await openFontDb()
  try {
    if (font) {
      await db.put(store, font, fontKey)
    } else {
      await db.delete(store, fontKey)
    }
    applyFace(face)
  } finally {
    db.close()
  }
}
