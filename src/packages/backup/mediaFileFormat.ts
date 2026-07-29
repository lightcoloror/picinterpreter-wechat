export function detectSoundExtension(
  data: Uint8Array,
  contentType = "",
) {
  const normalizedType = String(contentType).toLocaleLowerCase();
  if (data.length >= 3 && String.fromCharCode(...data.slice(0, 3)) === "ID3")
    return "mp3";
  if (data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0) {
    return normalizedType.includes("aac") ? "aac" : "mp3";
  }
  if (
    data.length >= 12 &&
    String.fromCharCode(...data.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...data.slice(8, 12)) === "WAVE"
  )
    return "wav";
  if (data.length >= 4 && String.fromCharCode(...data.slice(0, 4)) === "OggS")
    return "ogg";
  if (data.length >= 8 && String.fromCharCode(...data.slice(4, 8)) === "ftyp")
    return "m4a";
  if (
    data.length >= 4 &&
    data[0] === 0x1a &&
    data[1] === 0x45 &&
    data[2] === 0xdf &&
    data[3] === 0xa3
  )
    return "webm";
  return "";
}

export function detectVideoExtension(
  data: Uint8Array,
  contentType = "",
) {
  const normalizedType = String(contentType).toLocaleLowerCase();
  if (
    data.length >= 12 &&
    String.fromCharCode(...data.slice(4, 8)) === "ftyp"
  )
    return "mp4";
  if (
    data.length >= 4 &&
    data[0] === 0x1a &&
    data[1] === 0x45 &&
    data[2] === 0xdf &&
    data[3] === 0xa3 &&
    normalizedType.includes("video")
  )
    return "webm";
  return "";
}
