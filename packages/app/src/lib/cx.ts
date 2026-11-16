/** 极简 className 组合，不引第三方依赖 */
export const cx = (...parts: Array<string | false | undefined>): string =>
  parts.filter(Boolean).join(" ");
