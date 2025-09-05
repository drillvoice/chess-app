const env =
  typeof process !== 'undefined'
    ? process.env.NODE_ENV
    : (import.meta as any)?.env?.MODE;
const isDev = env !== 'production';

const noop = () => {};

export const logger = {
  debug: isDev ? (...args: any[]) => console.debug(...args) : noop,
  info: isDev ? (...args: any[]) => console.info(...args) : noop,
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
};
