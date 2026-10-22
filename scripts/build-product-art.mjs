import fs from "fs";
import path from "path";
import sharp from "sharp";

const outDir = "d:/kylo-auth/UNI - Loader/UNI/framework/data/bins";
const jobs = [
  {
    src: "C:/Users/wz2jl80z/.cursor/projects/d-kylo-auth/assets/aim-assist-mouse-bright.jpg",
    base: "product_mouse.png",
    hover: "product_mouse_hov.png",
  },
  {
    src: "C:/Users/wz2jl80z/.cursor/projects/d-kylo-auth/assets/controller-scripts-pad-bright.jpg",
    base: "product_pad.png",
    hover: "product_pad_hov.png",
  },
];

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function distanceField(mask, width, height) {
  const inf = 1e6;
  const dist = new Float32Array(width * height);
  for (let i = 0; i < dist.length; i++) dist[i] = mask[i] ? 0 : inf;
  const relax = (i, j, add) => {
    if (dist[j] + add < dist[i]) dist[i] = dist[j] + add;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) relax(i, i - 1, 1);
      if (y > 0) relax(i, i - width, 1);
      if (x > 0 && y > 0) relax(i, i - width - 1, 1.414);
      if (x + 1 < width && y > 0) relax(i, i - width + 1, 1.414);
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x + 1 < width) relax(i, i + 1, 1);
      if (y + 1 < height) relax(i, i + width, 1);
      if (x + 1 < width && y + 1 < height) relax(i, i + width + 1, 1.414);
      if (x > 0 && y + 1 < height) relax(i, i + width - 1, 1.414);
    }
  }
  return dist;
}

function floodBlack(pixels, width, height, channels) {
  const count = width * height;
  const marked = new Uint8Array(count);
  const queue = [];
  const isBlack = (i) => {
    const o = i * channels;
    return Math.max(pixels[o], pixels[o + 1], pixels[o + 2]) < 18;
  };
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (marked[i] || !isBlack(i)) return;
    marked[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return marked;
}

function fillHoles(object, width, height) {
  const count = width * height;
  const seen = new Uint8Array(count);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (seen[i] || object[i]) return;
    seen[i] = 1;
    queue.push(i);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % width;
    const y = (i - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  for (let i = 0; i < count; i++) {
    if (!seen[i]) object[i] = 1;
  }
}

function liftPixel(r, g, b) {
  const lift = (v) => clamp(Math.round(v * 1.12 + 18));
  let rr = lift(r);
  let gg = lift(g);
  let bb = lift(b);
  if (r > g + 18 && r > b + 12) {
    rr = clamp(rr + 18);
    gg = clamp(gg - 4);
    bb = clamp(bb - 4);
  }
  return [rr, gg, bb];
}

async function cutout(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = Buffer.from(data);
  const { width, height, channels } = info;
  const backdrop = floodBlack(pixels, width, height, channels);
  const object = new Uint8Array(width * height);
  for (let i = 0; i < object.length; i++) object[i] = backdrop[i] ? 0 : 1;
  fillHoles(object, width, height);
  const fromObj = distanceField(object, width, height);
  const closeR = 36;
  const dilated = new Uint8Array(width * height);
  const dilatedBg = new Uint8Array(width * height);
  for (let i = 0; i < object.length; i++) {
    dilated[i] = fromObj[i] <= closeR ? 1 : 0;
    dilatedBg[i] = dilated[i] ? 0 : 1;
  }
  const insetDilated = distanceField(dilatedBg, width, height);
  for (let i = 0; i < object.length; i++) object[i] = insetDilated[i] >= closeR ? 1 : 0;
  fillHoles(object, width, height);
  const background = new Uint8Array(width * height);
  for (let i = 0; i < object.length; i++) background[i] = object[i] ? 0 : 1;
  const inset = distanceField(background, width, height);
  const feather = 4;
  for (let i = 0; i < object.length; i++) {
    const o = i * channels;
    if (!object[i]) {
      pixels[o + 3] = 0;
      continue;
    }
    let alpha = 255;
    if (inset[i] < feather) alpha = Math.round(255 * (inset[i] / feather));
    const [rr, gg, bb] = liftPixel(pixels[o], pixels[o + 1], pixels[o + 2]);
    pixels[o] = rr;
    pixels[o + 1] = gg;
    pixels[o + 2] = bb;
    pixels[o + 3] = alpha;
  }
  return sharp(pixels, { raw: { width, height, channels } }).png().toBuffer();
}

function outlineFromProduct(pixels, width, height, channels) {
  const count = width * height;
  const object = new Uint8Array(count);
  for (let i = 0; i < count; i++) object[i] = pixels[i * channels + 3] > 96 ? 1 : 0;
  fillHoles(object, width, height);
  const background = new Uint8Array(count);
  for (let i = 0; i < count; i++) background[i] = object[i] ? 0 : 1;
  const outDist = distanceField(object, width, height);
  const inDist = distanceField(background, width, height);
  const stroke = 2.1;
  const aa = 0.7;
  const out = Buffer.alloc(count * 4);
  for (let i = 0; i < count; i++) {
    const s = object[i] ? -inDist[i] : outDist[i];
    let t = 0;
    if (s >= -aa && s < 0) t = (s + aa) / aa;
    else if (s >= 0 && s <= stroke) t = 1;
    else if (s > stroke && s < stroke + aa) t = 1 - (s - stroke) / aa;
    const o = i * 4;
    out[o] = 255;
    out[o + 1] = 255;
    out[o + 2] = 255;
    out[o + 3] = Math.round(255 * t);
  }
  return out;
}

async function compose(cut) {
  const canvas = 512;
  const inner = await sharp(cut)
    .trim({ threshold: 8 })
    .resize(Math.round(canvas * 0.84), Math.round(canvas * 0.84), { fit: "inside" })
    .png()
    .toBuffer();
  return sharp({
    create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: inner, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function composeOutline(productPng) {
  const { data, info } = await sharp(productPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const outline = outlineFromProduct(data, info.width, info.height, info.channels);
  return sharp(outline, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

fs.mkdirSync(outDir, { recursive: true });
for (const job of jobs) {
  const cut = await cutout(job.src);
  const base = await compose(cut);
  const hover = await composeOutline(base);
  fs.writeFileSync(path.join(outDir, job.base), base);
  fs.writeFileSync(path.join(outDir, job.hover), hover);
  console.log(job.base, base.length, job.hover, hover.length);
}
