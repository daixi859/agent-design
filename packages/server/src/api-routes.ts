/**
 * 浏览数据端点（ADR-0019）：path + query → 数据，传输无关的纯函数层。
 *
 * 只做文件访问：扫描 ~/.pi/agent/sessions、解析 JSONL、按字节偏移增量 tail，
 * 外加内核全局目录的只读投影；领域逻辑（活动分支回溯、usage 汇总）在 app/src/lib，不在本层。
 * 刻意不引用任何 node:http 类型（IncomingMessage / ServerResponse 只出现在 ./pi-data.ts 的壳层）：
 * server 的 http 壳与桌面壳的 app:// scheme 共用同一份分发，端点语义单源
 * （ADR-0019「浏览路径走自定义协议」）。
 */
import { homedir } from "node:os";
import { join, basename } from "node:path";
import { stat, readdir, readFile, open } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { errorMessage } from "@pi-studio/shared/errors";
import { firstUserText } from "@pi-studio/shared/message-text";
import type {
  SessionDetail,
  SessionEntry,
  SessionHeaderEntry,
  SessionInfoEntry,
  SessionSummary,
  SessionsResponse,
  TailResponse,
} from "@pi-studio/shared/pi-types";
import type { GlobalCatalog } from "@pi-studio/shared/protocol";

const SESSIONS_ROOT =
  process.env.PI_STUDIO_SESSIONS_DIR ?? join(homedir(), ".pi", "agent", "sessions");

/** 列表标题扫描读取的前缀大小：覆盖 header + 前若干条消息，避免整文件读取 */
const TITLE_SCAN_BYTES = 64 * 1024;

/** 端点层会产出的错误状态码：400 请求参数坏（不可解析的偏移/转义）/ 404 会话不存在 / 500 文件坏或装配失败 */
type ApiErrorStatus = 400 | 404 | 500;

// 参数属性等非可擦除语法不可用：本包要被 Node 原生 type-stripping 直跑（ADR-0012）
class HttpError extends Error {
  readonly status: ApiErrorStatus;
  constructor(status: ApiErrorStatus, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------- 端点裁定的契约 ----------

/** 属主查询（Send-to-Attach）：组装层注入 registry.isFileDriven，列表据此标 driven */
export type IsFileDriven = (file: string) => boolean;

/** 端点层的外界依赖（组装层注入）：文件访问之外的两处内核态/运行态读数 */
export interface ApiDeps {
  /** 属主谓词，缺省视为未驱动（列表不占 driven 载荷） */
  isFileDriven?: IsFileDriven;
  /** 全局目录（补记十四/十五）：内核态投影，不属文件访问层；组装层注入 core 的 globalCatalog */
  catalog(): Promise<GlobalCatalog>;
}

/** 成功载荷的联合：现有四条只读 GET 的数据形状（shared/pi-types 与 shared/protocol 定型） */
export type ApiPayload = SessionsResponse | SessionDetail | TailResponse | GlobalCatalog;

/** 失败载荷：与拆分前 pi-data 的 catch 口径一致（error 字段是客户端既有契约） */
export interface ApiErrorBody {
  error: string;
}

/** 端点判定的产物（按 kind 可判别）：端点层只管「是谁、多少钱」——状态码与载荷；
    写成什么（HTTP 响应 / app:// Response）归适配器。
    kind: "unmatched" 表示没有端点认领该路径，兜底（静态托管 / SPA 回落）归适配器。 */
export type ApiResult =
  | { kind: "unmatched" }
  | { kind: "ok"; status: 200; body: ApiPayload }
  | { kind: "error"; status: ApiErrorStatus; body: ApiErrorBody };

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

async function listSessions(
  options: { isFileDriven?: IsFileDriven },
): Promise<SessionsResponse> {
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

async function readSession(id: string): Promise<SessionDetail> {
  const ref = await findFileById(id);
  const text = await readFile(ref.file, "utf8");
  const entries = parseEntries(text);
  const header = entries.find((e) => e.type === "session") as SessionHeaderEntry | undefined;
  if (!header) throw new HttpError(500, `invalid session file: ${ref.file}`);
  // 完整行**字节**偏移：末尾半行不计入，tail 从这里续读。
  // 必须按字节算——tail 的 offset 是 open().read(position) 的字节位置；
  // 若用字符下标（lastIndexOf + 1），含中文的会话会错位（多字节字符每字节一格），
  // tail 从字符下标处起读会落在一个 UTF-8 字符中间，进而吃掉下一个完整行。
  const lastNewline = text.lastIndexOf("\n");
  const prefix = lastNewline === -1 ? "" : text.slice(0, lastNewline + 1);
  return {
    file: ref.file,
    header,
    entries,
    sizeBytes: ref.sizeBytes,
    mtimeMs: ref.mtimeMs,
    offset: Buffer.byteLength(prefix),
  };
}

async function tailSession(id: string, offset: number): Promise<TailResponse> {
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

// ---------- 端点分发 ----------

/** 查询串归一：接受已解析的 URLSearchParams 或原始串（含/不含 "?" 均可） */
function paramsOf(query: string | URLSearchParams): URLSearchParams {
  return typeof query === "string" ? new URLSearchParams(query) : query;
}

/**
 * 路径参数解码：坏的百分号转义（`%E0%A4%A`）是**客户端请求坏**，判 400。
 * 先前直接冒泡 decodeURIComponent 的 URIError，落 500 并把英文内部文案透给客户端。
 */
function decodeId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    throw new HttpError(400, `malformed session id: ${raw}`);
  }
}

/**
 * tail 偏移解析：只接受整数字面量（十进制，可带负号，负数随后夹到 0）。
 * 先前 `Number("abc") = NaN` 会一路走到 `Buffer.alloc(NaN)` 抛 ERR_OUT_OF_RANGE，
 * 落 500 且把 Node 的内部英文文案回给客户端——参数错应当先在这里拦成 400。
 */
function parseOffset(raw: string | null): number {
  if (raw === null || raw === "") return 0;
  if (!/^-?\d+$/.test(raw)) throw new HttpError(400, `invalid offset: ${raw}`);
  return Number(raw);
}

/**
 * 路径 + 查询 → 数据。**仅 GET 语义**（浏览路径只读）：调用方对非 GET 请求不应调用本函数，
 * 视同无匹配。返回 { kind: "unmatched" } 表示没有端点认领该路径，由适配器决定兜底
 * （server：fallthrough 到静态托管；桌面壳：app:// 的静态资源同样接管）。
 *
 * 端点清单（与 REST 一一对应，ADR-0012 补记十一/十四）：
 *   GET /sessions                        会话列表（注入 isFileDriven 标 driven）
 *   GET /session/:id                     会话详情（全量条目 + 续读偏移）
 *   GET /session/:id/tail?offset=N       增量 tail（只消费完整行）
 *   GET /catalog                         内核全局目录（Model Seat / Trigger Menu 兜底）
 *
 * 失败一律收敛为 { error } 载荷：HttpError 带状态码（400 参数坏 / 404 会话不存在 / 500 文件坏），
 * 其余异常按 500 落（与拆分前 pi-data 的 catch 口径一致）。
 */
export async function resolveApi(
  pathname: string,
  query: string | URLSearchParams,
  deps: ApiDeps,
): Promise<ApiResult> {
  try {
    const params = paramsOf(query);
    if (pathname === "/sessions") {
      return { kind: "ok", status: 200, body: await listSessions({ isFileDriven: deps.isFileDriven }) };
    }
    const tailMatch = pathname.match(/^\/session\/([^/]+)\/tail$/);
    if (tailMatch) {
      const offset = parseOffset(params.get("offset"));
      return { kind: "ok", status: 200, body: await tailSession(decodeId(tailMatch[1]), offset) };
    }
    const detailMatch = pathname.match(/^\/session\/([^/]+)$/);
    if (detailMatch) {
      return { kind: "ok", status: 200, body: await readSession(decodeId(detailMatch[1])) };
    }
    // 全局目录：内核态投影，与文件访问端点同居本层（原 main.ts 在 pi-data fallthrough 前的特判）
    if (pathname === "/catalog") {
      return { kind: "ok", status: 200, body: await deps.catalog() };
    }
  } catch (error) {
    // HttpError 自带状态码（400 参数坏 / 404 会话不存在 / 500 文件坏），其余一律 500（与拆分前同口径）
    const status = error instanceof HttpError ? error.status : 500;
    return { kind: "error", status, body: { error: errorMessage(error) } };
  }
  return { kind: "unmatched" };
}
