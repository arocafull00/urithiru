import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const dir = new URL("../public/icons/", import.meta.url);
await mkdir(dir, { recursive: true });
function icon(maskable = false) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="${maskable ? 0 : 105}" fill="#6b862f"/><path d="M${maskable ? "140 263h62l40-98 58 179 40-81h32" : "96 264h80l48-120 72 224 48-104h72"}" fill="none" stroke="white" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  );
}
await Promise.all([
  sharp(icon())
    .resize(192)
    .png()
    .toFile(fileURLToPath(new URL("icon-192.png", dir))),
  sharp(icon())
    .png()
    .toFile(fileURLToPath(new URL("icon-512.png", dir))),
  sharp(icon(true))
    .png()
    .toFile(fileURLToPath(new URL("maskable-512.png", dir))),
  sharp(icon())
    .resize(180)
    .png()
    .toFile(fileURLToPath(new URL("apple-touch-icon.png", dir))),
]);
const og = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0a0a0a"/><text x="100" y="275" font-family="Arial" font-size="92" font-weight="bold" fill="white">urithiru<tspan fill="#b7da80">.</tspan></text><text x="104" y="355" font-family="Arial" font-size="32" fill="#aaa">Todos tus proyectos. Un solo lugar.</text></svg>',
);
await writeFile(
  new URL("../public/og.png", import.meta.url),
  await sharp(og).png().toBuffer(),
);
console.log("Iconos PWA y Open Graph generados.");
