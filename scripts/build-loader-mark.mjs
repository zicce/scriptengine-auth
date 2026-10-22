import fs from "fs";
import path from "path";
import sharp from "sharp";

const source = process.argv[2];
const pngOut = process.argv[3];
const incOut = process.argv[4];
const PAYLOAD = 96 * 1024;
const HEADER = 32;

if (!source || !pngOut || !incOut) {
  console.error("usage: node build-loader-mark.mjs <source> <png> <inc>");
  process.exit(1);
}

function dark(pixel) {
  return pixel[0] < 36 && pixel[1] < 36 && pixel[2] < 36;
}

async function normalize(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  const { width, height, channels } = info;
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
  const inner = await sharp(pixels, { raw: { width, height, channels } })
    .trim({ threshold: 8 })
    .resize(240, 240, { fit: "inside" })
    .png()
    .toBuffer();
  return sharp({
    create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: inner, gravity: "center" }])
    .png({ compressionLevel: 9, palette: true, effort: 10 })
    .toBuffer();
}

const png = await normalize(source);
if (png.length > PAYLOAD) {
  console.error(`png is ${png.length} bytes, slot is ${PAYLOAD}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(pngOut), { recursive: true });
fs.mkdirSync(path.dirname(incOut), { recursive: true });
fs.writeFileSync(pngOut, png);

const stamp = Buffer.alloc(HEADER + PAYLOAD + 8);
Buffer.from("SELOGOCFG0000001", "ascii").copy(stamp, 0);
stamp.writeUInt32LE(png.length, 16);
stamp.writeUInt16LE(256, 20);
stamp.writeUInt16LE(256, 22);
png.copy(stamp, HEADER);
Buffer.from("SELOGO!!", "ascii").copy(stamp, HEADER + PAYLOAD);

const bytes = [];
for (const value of stamp) bytes.push(`0x${value.toString(16).padStart(2, "0")}`);
const lines = [];
for (let index = 0; index < bytes.length; index += 16) lines.push(bytes.slice(index, index + 16).join(", "));
fs.writeFileSync(incOut, `${lines.join(",\n")}\n`);
console.log(`png ${png.length} stamp ${stamp.length}`);
