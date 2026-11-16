// 跨包共用的零依赖工具（同构层）：错误取文案
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
