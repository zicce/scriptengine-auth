import sharp from "sharp";
import { LOGO_PAYLOAD } from "./loader-brand";

const MAX_UPLOAD = 4 * 1024 * 1024;

function dark(pixel) {
  return pixel[0] < 36 && pixel[1] < 36 && pixel[2] < 36;
}

async function encodeMark(input) {
  const { data, info } = await sharp(input, { failOn: "none", limitInputPixels: 24 * 1024 * 1024 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  const { width, height, channels } = info;
  if (!width || !height) return { error: "This image could not be read." };
  const at = (x, y) => {
    const index = (y * width + x) * channels;
    return [pixels[index], pixels[index + 1], pixels[index + 2], pixels[index + 3]];
  };
  const corners = [at(0, 0), at(width - 1, 0), at(0, height - 1), at(width - 1, height - 1)];
  if (corners.every((pixel) => pixel[3] > 240 && dark(pixel))) {
    for (let index = 0; index < pixels.length; index += channels) {
      if (dark([pixels[index], pixels[index + 1], pixels[index + 2]])) pixels[index + 3] = 0;
    }
  }

  const trimmed = await sharp(pixels, { raw: { width, height, channels } }).trim({ threshold: 8 }).png().toBuffer();
  let canvas = 256;
  let png = null;
  while (canvas >= 96) {
    const inner = Math.max(16, canvas - Math.round(canvas * 0.0625) * 2);
    const fitted = await sharp(trimmed).resize(inner, inner, { fit: "inside" }).png().toBuffer();
    png = await sharp({
      create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: fitted, gravity: "center" }])
      .png({ compressionLevel: 9, palette: true, effort: 10 })
      .toBuffer();
    if (png.length <= LOGO_PAYLOAD) break;
    canvas -= 32;
    png = null;
  }
  if (!png) return { error: "Logo is too detailed to fit. Use a simpler image." };
  return { png, width: canvas, height: canvas };
}

export async function prepareResellerLogo(bytes) {
  if (!bytes?.length) return { error: "Choose a logo image." };
  if (bytes.length > MAX_UPLOAD) return { error: "Logo must be 4 MB or smaller." };
  try {
    return await encodeMark(bytes);
  } catch {
    return { error: "Use a PNG, WEBP, or JPEG logo." };
  }
}
