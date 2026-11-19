// Card images are optional. Put files in src/assets/cards/ and they are picked up automatically.
// Any card without an image is drawn in code instead, so you can add art a few cards at a time.
//
// File names (any of .png .jpg .jpeg .webp .svg):
//   red-0 ... red-9, red-skip, red-reverse, red-draw2   (same for yellow, green, blue)
//   wild, wild4, back
//   back-classic, back-nomercy, back-flip, ... : a back for one mode only (falls back to 'back')
//   other modes use the same pattern, e.g. teal-draw5, red-discardall, wild10, roulette
//   e.g. src/assets/cards/red-7.png, src/assets/cards/wild4.svg, src/assets/cards/back.png

const files = import.meta.glob('../assets/cards/*.{png,jpg,jpeg,webp,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
})

// "../assets/cards/red-7.png" -> "red-7"
const images = Object.fromEntries(
  Object.entries(files).map(([path, url]) => [path.split('/').pop().replace(/\.\w+$/, ''), url]),
)

// works with a card face: { color, value }
export const cardImageName = (f) => (f.color === 'wild' ? f.value : `${f.color}-${f.value}`)

export const cardImage = (f) => images[cardImageName(f)] ?? null

export const backImage = images.back ?? null

// the back for a mode: back-<mode> first, then the shared 'back', then null (drawn in CSS)
export const backImageFor = (mode) => images[`back-${mode}`] ?? backImage
