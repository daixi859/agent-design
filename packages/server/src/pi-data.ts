/**
 * Pi Studio 只读数据 API（ADR-0002）。
 * 仅做文件访问：扫描 ~/.pi/agent/sessions、解析 JSONL、按字节偏移增量 tail。
 * 领域逻辑（活动分支回溯、usage 汇总）在 src/lib，不在本层。
 */
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { stat, readdir, readFile, open } from "node:fs/promises";
import type { Dirent } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { errorMessage } from "@pi-studio/shared/errors";
import { firstUserText } from "@pi-studio/shared/message-text";
import type {
  SessionEntry,
  SessionHeaderEntry,
  SessionInfoEntry,
  SessionSummary,
} from "@pi-studio/shared/pi-types";

const SESSIONS_ROOT =
  process.env.PI_STUDIO_SESSIONS_DIR ?? join(homedir(), ".pi", "agent", "sessions");

/** 列表标题扫描读取的前缀大小：覆盖 header + 前若干条消息，避免整文件读取 */
const TITLE_SCAN_BYTES = 64 * 1024;

// 参数属性等非可擦除语法不可用：本包要被 Node 原生 type-stripping 直跑（ADR-0012）
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------- 文件扫描 ----------

interface FileRef {
  file: string;
  mtimeMs: number;
  sizeBytes: number;
}

async function scanSessionFiles(): Promise<FileRef[]> {
  const refs: FileRef[] = [];
  let dirs: Dirent[];
  try {
    dirs = await readdir(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    return refs; // 根目录不存在时返回空，由 /sessions 响应里的 rootExists 标记
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const dirPath = join(SESSIONS_ROOT, dir.name);
    let names: string[];
    try {
      names = await readdir(dirPath);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const file = join(dirPath, name);
      try {
        const st = await stat(file);
        if (st.isFile()) refs.push({ file, mtimeMs: st.mtimeMs, sizeBytes: st.size });
      } catch {
        // 文件可能刚被删除，跳过
      }
    }
  }
  return refs;
}

async function findFileById(id: string): Promise<FileRef> {
  const refs = await scanSessionFiles();
  const ref = refs.find((r) => basename(r.file).endsWith(`_${id}.jsonl`));
  if (!ref) throw new HttpError(404, `session not found: ${id}`);
  return ref;
}

// ---------- JSONL 解析 ----------

function parseEntries(text: string): SessionEntry[] {
  const entries: SessionEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as SessionEntry);
    } catch {
      // 半行或坏行跳过（前缀扫描的末行可能不完整）
    }
  }
  return entries;
}

async function readPrefix(file: string, bytes: number): Promise<string> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

// ---------- 列表（带 mtime+size 缓存） ----------

interface ListMeta {
  header?: SessionHeaderEntry;
  title?: string;
  name?: string;
  model?: string;
  provider?: string;
}

const metaCache = new Map<string, { key: string; meta: ListMeta }>();

async function listMeta(ref: FileRef): Promise<ListMeta> {
  const key = `${ref.mtimeMs}:${ref.sizeBytes}`;
  const cached = metaCache.get(ref.file);
  if (cached?.key === key) return cached.meta;

  const entries = parseEntries(await readPrefix(ref.file, TITLE_SCAN_BYTES));
  const modelChange = entries.find((e) => e.type === "model_change") as
    | { provider?: string; modelId?: string }
    | undefined;
  // session_info 可能落在前缀之外，缺失可接受，detail 端会有全量
  const sessionInfo = entries.find((e) => e.type === "session_info") as
    | SessionInfoEntry
    | undefined;
  const meta: ListMeta = {
    header: entries.find((e) => e.type === "session") as SessionHeaderEntry | undefined,
    title: firstUserText(entries),
    name: sessionInfo?.name,
    model: modelChange?.modelId,
    provider: modelChange?.provider,
  };
  metaCache.set(ref.file, { key, meta });
  return meta;
}

/** 属主查询（Send-to-Attach）：组装层注入 registry.isFileDriven，列表据此标 driven */
type IsFileDriven = (file: string) => boolean;

async function listSessions(
  options: { isFileDriven?: IsFileDriven },
): Promise<{ rootExists: boolean; sessions: SessionSummary[] }> {
  const { isFileDriven } = options;
  let rootExists = true;
  try {
    await stat(SESSIONS_ROOT);
  } catch {
    rootExists = false;
  }
  const refs = await scanSessionFiles();
  const sessions: SessionSummary[] = [];
  for (const ref of refs) {
    const meta = await listMeta(ref);
    const header = meta.header;
    if (!header?.cwd) continue;
    sessions.push({
      id: header.id,
      file: ref.file,
      projectPath: header.cwd,
      projectName: basename(header.cwd) || header.cwd,
      name: meta.name,
      title: meta.title,
      startedAt: header.timestamp,
      lastActiveAt: new Date(ref.mtimeMs).toISOString(),
      sizeBytes: ref.sizeBytes,
      model: meta.model,
      provider: meta.provider,
      ...(isFileDriven?.(ref.file) ? { driven: true } : {}),
    });
  }
  sessions.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt));
  return { rootExists, sessions };
}

// ---------- 详情与增量 tail ----------

/** 从读取块中只消费完整行，末尾半行留给下轮轮询（Live Tail 契约的 server 半边，纯函数便于锁定测试）。
    返回 undefined 表示块内无完整行。 */
export function consumeCompleteLines(chunk: string): { text: string; entries: SessionEntry[]; consumedBytes: number } | undefined {
  const lastNewline = chunk.lastIndexOf("\n");
  if (lastNewline === -1) return undefined;
  const text = chunk.slice(0, lastNewline + 1);
  return { text, entries: parseEntries(text), consumedBytes: Buffer.byteLength(text) };
}

async function readSession(id: string) {
  const ref = await findFileById(id);
  const text = await readFile(ref.file, "utf8");
  const entries = parseEntries(text);
  const header = entries.find((e) => e.type === "session") as SessionHeaderEntry | undefined;
  if (!header) throw new HttpError(500, `invalid session file: ${ref.file}`);
  // 完整行字节偏移：末尾半行不计入，tail 从这里续读
  const lastNewline = text.lastIndexOf("\n");
  return {
    file: ref.file,
    header,
    entries,
    sizeBytes: ref.sizeBytes,
    mtimeMs: ref.mtimeMs,
    offset: lastNewline === -1 ? 0 : lastNewline + 1,
  };
}

async function tailSession(id: string, offset: number) {
  const ref = await findFileById(id);
  const safeOffset = Math.max(0, Math.min(offset, ref.sizeBytes));
  const empty = { sizeBytes: ref.sizeBytes, mtimeMs: ref.mtimeMs, offset: safeOffset, entries: [] as SessionEntry[] };
  if (safeOffset >= ref.sizeBytes) return empty;

  const handle = await open(ref.file, "r");
  try {
    const length = ref.sizeBytes - safeOffset;
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, safeOffset);
    const consumed = consumeCompleteLines(buffer.toString("utf8"));
    if (!consumed) return empty;
    return {
      sizeBytes: ref.sizeBytes,
      mtimeMs: ref.mtimeMs,
      offset: safeOffset + consumed.consumedBytes,
      entries: consumed.entries,
    };
  } finally {
    await handle.close();
  }
}

// ---------- connect 中间件 ----------

/** JSON 响应助手：pi-data 与 main.ts（/api/catalog，补记十四）共用 */
export function json(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

export function createPiDataApi(options: { isFileDriven?: IsFileDriven } = {}) {
  const { isFileDriven } = options;
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? "/", "http://local");
    const path = url.pathname;
    try {
      if (req.method === "GET" && path === "/sessions") {
        return json(res, 200, await listSessions({ isFileDriven }));
      }
      let m = path.match(/^\/session\/([^/]+)\/tail$/);
      if (req.method === "GET" && m) {
        return json(res, 200, await tailSession(decodeURIComponent(m[1]), Number(url.searchParams.get("offset") ?? "0")));
      }
      m = path.match(/^\/session\/([^/]+)$/);
      if (req.method === "GET" && m) {
        return json(res, 200, await readSession(decodeURIComponent(m[1])));
      }
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = errorMessage(error);
      return json(res, status, { error: message });
    }
    next();
  };
}
