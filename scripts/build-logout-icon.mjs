import fs from "fs";
import sharp from "sharp";

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-3 -3 30 30">
  <g fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </g>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
const bytes = [...png].map((value) => `0x${value.toString(16).padStart(2, "0")}`);
const lines = [];
for (let index = 0; index < bytes.length; index += 16) lines.push(bytes.slice(index, index + 16).join(", "));
const header = `#pragma once\ninline unsigned char logout_icon_png[] = {\n${lines.join(",\n")}\n};\ninline unsigned int logout_icon_png_size = sizeof(logout_icon_png);\n`;
fs.writeFileSync("d:/kylo-auth/UNI - Loader/UNI/framework/data/logout_icon.h", header);
fs.writeFileSync("d:/kylo-auth/resell.scriptengine.gg/public/images/logout-icon.png", png);
console.log("png", png.length);
