export interface Logger {
  debug: (msg: string) => void
  info: (msg: string) => void
  warn: (msg: string) => void
  error: (msg: string) => void
}

export function createLogger(name: string): Logger {
  const prefix = `[${name}]`

  return {
    debug: (msg: string) => console.debug(prefix, msg),
    info: (msg: string) => console.info(prefix, msg),
    warn: (msg: string) => console.warn(prefix, msg),
    error: (msg: string) => console.error(prefix, msg)
  }
}
