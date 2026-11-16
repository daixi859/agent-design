// 内核接入层出口（ADR-0012）：宿主（server / 未来 desktop）从这里取全部驱动能力
export { SessionHost, type SessionHostOptions } from "./session-host.ts";
export { RegistryError, SessionRegistry } from "./session-registry.ts";
export { normalizeSessionEvent } from "./normalize.ts";
export { openPiSession } from "./pi-session-source.ts";
export type {
  InputDisposition,
  StreamingBehavior,
  PromptOptions,
  PiSessionLike,
  PiSessionFactory,
  PiSessionRequest,
} from "./types.ts";
