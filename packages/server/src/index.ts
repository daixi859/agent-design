// 服务层出口：只读数据 API（ADR-0002；阶段三扩 WS 驱动协议，见 ADR-0012）
// 相对导入带 .ts 扩展名：兼容 Node ESM 原生解析
export * from "./pi-data.ts";
