// 桌面图标生成：把 web 端已有品牌图（packages/app/public/icons/icon-512.png）
// 转成 Windows 打包要的 .ico（多尺寸 256/128/64/48/32/16，PNG 压缩条目）。
//
// 为什么自己写而不是装个图库：只为一件事——把一张已有 PNG 缩六个尺寸、包个 ICO 头。
// zlib 是 Node 内建，PNG 编解码各几十行，比多一个构建期原生依赖（sharp / canvas）划算得多，
// 而且品牌图只有一份：桌面图标必须与 web 图标逐像素同源，不能手工另画一个。
//
//   node packages/desktop/scripts/make-icon.mjs
//
// 输出 packages/desktop/build/icons/icon.ico（electron-builder 的 win.icon 指向它）。
import { deflateSync, inflateSync } from "node:zlib";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DESKTOP_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPO_ROOT = join(DESKTOP_ROOT, "..", "..");
const SOURCE = join(REPO_ROOT, "packages", "app", "public", "icons", "icon-512.png");
const OUT_DIR = join(DESKTOP_ROOT, "build", "icons");
/** ICO 收录的尺寸：256 是现代缩放视图，16/20/24/32/40/48 覆盖任务栏与资源管理器各档 */
const SIZES = [256, 128, 64, 48, 40, 32, 24, 20, 16];

// ===== PNG 解码（只支持本仓库用到的 8 位 RGB/RGBA、非隔行，够用即止）=====

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error("不是 PNG：签名不符");
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  let offset = 8;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      const colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8) throw new Error(`只支持 8 位通道，实为 ${bitDepth}`);
      if (interlace !== 0) throw new Error("不支持隔行 PNG");
      if (colorType === 6) channels = 4;
      else if (colorType === 2) channels = 3;
      else throw new Error(`只支持 RGB/RGBA，实为 colorType=${colorType}`);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  if (!width || !height) throw new Error("PNG 缺少 IHDR");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    unfilter(filter, line, previous, channels);
    for (let x = 0; x < width; x += 1) {
      const target = (y * width + x) * 4;
      pixels[target] = line[x * channels];
      pixels[target + 1] = line[x * channels + 1];
      pixels[target + 2] = line[x * channels + 2];
      pixels[target + 3] = channels === 4 ? line[x * channels + 3] : 255;
    }
    previous = line;
  }
  return { width, height, pixels };
}

/** PNG 逐行滤波器（规范 9.2）：复原出原始字节 */
function unfilter(filter, line, previous, channels) {
  for (let i = 0; i < line.length; i += 1) {
    const left = i >= channels ? line[i - channels] : 0;
    const up = previous[i];
    const upLeft = i >= channels ? previous[i - channels] : 0;
    switch (filter) {
      case 0:
        break;
      case 1:
        line[i] = (line[i] + left) & 0xff;
        break;
      case 2:
        line[i] = (line[i] + up) & 0xff;
        break;
      case 3:
        line[i] = (line[i] + ((left + up) >> 1)) & 0xff;
        break;
      case 4:
        line[i] = (line[i] + paeth(left, up, upLeft)) & 0xff;
        break;
      default:
        throw new Error(`未知的行滤波器：${filter}`);
    }
  }
}

function paeth(left, up, upLeft) {
  const estimate = left + up - upLeft;
  const dl = Math.abs(estimate - left);
  const du = Math.abs(estimate - up);
  const dul = Math.abs(estimate - upLeft);
  if (dl <= du && dl <= dul) return left;
  return du <= dul ? up : upLeft;
}

// ===== 缩放：预乘 alpha 的盒式平均，避免透明边缘发黑 =====

function resize(source, size) {
  const scale = source.width / size;
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const y0 = Math.floor(y * scale);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
    for (let x = 0; x < size; x += 1) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let count = 0;
      for (let sy = y0; sy < y1; sy += 1) {
        for (let sx = x0; sx < x1; sx += 1) {
          const index = (sy * source.width + sx) * 4;
          const alpha = source.pixels[index + 3];
          // 预乘后再平均：全透明像素不该把颜色拉向黑
          r += source.pixels[index] * alpha;
          g += source.pixels[index + 1] * alpha;
          b += source.pixels[index + 2] * alpha;
          a += alpha;
          count += 1;
        }
      }
      const target = (y * size + x) * 4;
      if (a === 0) {
        out[target] = 0;
        out[target + 1] = 0;
        out[target + 2] = 0;
        out[target + 3] = 0;
      } else {
        out[target] = Math.round(r / a);
        out[target + 1] = Math.round(g / a);
        out[target + 2] = Math.round(b / a);
        out[target + 3] = Math.round(a / count);
      }
    }
  }
  return out;
}

// ===== PNG 编码（RGBA8，全 0 滤波器——图标体积小，简单优先）=====

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels, size) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 位深
  header[9] = 6; // RGBA
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ===== ICO 容器（ICONDIR + ICONDIRENTRY[] + 数据区）=====

function encodeIco(images) {
  const directory = Buffer.alloc(6);
  directory.writeUInt16LE(0, 0); // 保留
  directory.writeUInt16LE(1, 2); // 1 = 图标
  directory.writeUInt16LE(images.length, 4);

  let dataOffset = 6 + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    // 256 在 ICO 里写 0（256 装不进一个字节）
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; // 调色板色数
    entry[3] = 0; // 保留
    entry.writeUInt16LE(1, 4); // 颜色平面
    entry.writeUInt16LE(32, 6); // 位深
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    dataOffset += png.length;
    return entry;
  });

  return Buffer.concat([directory, ...entries, ...images.map((image) => image.png)]);
}

// ===== 主流程 =====

const source = decodePng(readFileSync(SOURCE));
console.log(`[icon] 源图 ${source.width}×${source.height} ← ${SOURCE.replace(`${REPO_ROOT}/`, "").replace(`${REPO_ROOT}\\`, "")}`);

const images = SIZES.map((size) => {
  const pixels = resize(source, size);
  return { size, png: encodePng(pixels, size) };
});

mkdirSync(OUT_DIR, { recursive: true });
const ico = join(OUT_DIR, "icon.ico");
const bytes = encodeIco(images);
writeFileSync(ico, bytes);
console.log(`[icon] 已生成 build/icons/icon.ico（${SIZES.join("/")}，${(bytes.length / 1024).toFixed(1)} kB）`);
