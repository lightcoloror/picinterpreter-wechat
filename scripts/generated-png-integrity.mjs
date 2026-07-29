import { inflateSync } from 'node:zlib'

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value

  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }

  return crc >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff

  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  }

  return (crc ^ 0xffffffff) >>> 0
}

function invalid(message) {
  throw new Error('Invalid generated PNG: ' + message)
}

export function inspectGeneratedPng(
  bytes,
  { expectedMaxSize = 96, expectedPaletteColors = 32 } = {}
) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 45) {
    invalid('file is truncated')
  }
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    invalid('signature is missing')
  }

  let offset = PNG_SIGNATURE.length
  let chunkIndex = 0
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let paletteColors = 0
  let sawPalette = false
  let sawImageData = false
  let sawImageEnd = false
  let sawTransparency = false
  const imageDataChunks = []

  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) {
      invalid('chunk header is truncated')
    }

    const chunkLength = bytes.readUInt32BE(offset)
    const chunkType = bytes.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const dataEnd = dataStart + chunkLength
    const chunkEnd = dataEnd + 4

    if (chunkEnd > bytes.length) {
      invalid(chunkType + ' chunk is truncated')
    }

    const expectedCrc = bytes.readUInt32BE(dataEnd)
    const actualCrc = crc32(bytes.subarray(offset + 4, dataEnd))
    if (actualCrc !== expectedCrc) {
      invalid(chunkType + ' chunk checksum does not match')
    }

    if (chunkIndex === 0 && chunkType !== 'IHDR') {
      invalid('IHDR is not the first chunk')
    }

    if (chunkType === 'IHDR') {
      if (chunkIndex !== 0 || chunkLength !== 13) {
        invalid('IHDR layout is invalid')
      }
      width = bytes.readUInt32BE(dataStart)
      height = bytes.readUInt32BE(dataStart + 4)
      bitDepth = bytes[dataStart + 8]
      colorType = bytes[dataStart + 9]
      const compressionMethod = bytes[dataStart + 10]
      const filterMethod = bytes[dataStart + 11]
      const interlaceMethod = bytes[dataStart + 12]

      if (
        compressionMethod !== 0 ||
        filterMethod !== 0 ||
        interlaceMethod !== 0
      ) {
        invalid('IHDR uses unsupported encoding options')
      }
    } else if (chunkType === 'PLTE') {
      if (sawPalette || sawImageData || chunkLength % 3 !== 0) {
        invalid('palette layout is invalid')
      }
      sawPalette = true
      paletteColors = chunkLength / 3
    } else if (chunkType === 'tRNS') {
      sawTransparency = true
    } else if (chunkType === 'IDAT') {
      sawImageData = true
      imageDataChunks.push(bytes.subarray(dataStart, dataEnd))
    } else if (chunkType === 'IEND') {
      if (chunkLength !== 0 || chunkEnd !== bytes.length) {
        invalid('IEND is invalid or trailing bytes are present')
      }
      sawImageEnd = true
    }

    offset = chunkEnd
    chunkIndex += 1
    if (sawImageEnd) {
      break
    }
  }

  if (!sawImageEnd || !sawImageData || !sawPalette) {
    invalid('required palette, image data, or end chunk is missing')
  }
  if (
    width < 1 ||
    height < 1 ||
    Math.max(width, height) !== expectedMaxSize
  ) {
    invalid('dimensions do not fit the generated size contract')
  }
  if (bitDepth !== 8 || colorType !== 3) {
    invalid('image is not an 8-bit indexed PNG')
  }
  if (
    paletteColors < 1 ||
    paletteColors > expectedPaletteColors ||
    sawTransparency
  ) {
    invalid('palette or opaque-background contract does not match')
  }

  let decoded
  try {
    decoded = inflateSync(Buffer.concat(imageDataChunks))
  } catch (error) {
    invalid('image data cannot be decompressed: ' + error.message)
  }

  const scanlineLength = width + 1
  if (decoded.length !== scanlineLength * height) {
    invalid('decoded image data has an unexpected length')
  }
  for (let row = 0; row < height; row += 1) {
    if (decoded[row * scanlineLength] > 4) {
      invalid('scanline uses an invalid PNG filter')
    }
  }

  return { width, height, bitDepth, colorType, paletteColors }
}
