/** pi 消息内容 → 显示文本的统一规则（server 列表标题与客户端渲染共用，
    AGENTS.md：领域规则不放 server 层）。形状归一、纯文本提取、标题提取各一份实现。 */
import type { AgentMessage, ContentBlock, MessageEntry, SessionEntry, UserMessage } from "./pi-types.ts";

/** 形状归一：string 视为单 text 块，数组原样返回 */
export function contentBlocks(content: string | ContentBlock[]): ContentBlock[] {
  return typeof content === "string" ? [{ type: "text", text: content }] : content;
}

/** 纯文本提取：text 块按换行拼接，非文本块跳过 */
export function contentText(content: string | ContentBlock[]): string {
  return contentBlocks(content)
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** 列表标题规则：首条 user 消息文本，空白折叠后截 80 字符（Q16） */
export function firstUserText(entries: SessionEntry[]): string | undefined {
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    // SessionEntry 并集带 catch-all 成员，判别后仍需收窄到 MessageEntry 才能安全取 message
    const message: AgentMessage = (entry as MessageEntry).message;
    if (message.role !== "user") continue;
    // role 判别无法收窄 catch-all 成员，与模型层同款按角色断言
    const clean = contentText((message as UserMessage).content).replace(/\s+/g, " ").trim();
    if (clean) return clean.slice(0, 80);
  }
  return undefined;
}
