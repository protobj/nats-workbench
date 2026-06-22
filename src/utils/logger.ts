const LOG_PREFIX = '[NATS-WB]'

function formatTime(): string {
  return new Date().toISOString().slice(11, 23)
}

export const logger = {
  info: (msg: string, data?: any) => {
    console.log(`${formatTime()} ${LOG_PREFIX} INFO  ${msg}`, data ?? '')
  },
  warn: (msg: string, data?: any) => {
    console.warn(`${formatTime()} ${LOG_PREFIX} WARN  ${msg}`, data ?? '')
  },
  error: (msg: string, data?: any) => {
    console.error(`${formatTime()} ${LOG_PREFIX} ERROR ${msg}`, data ?? '')
  },
  debug: (msg: string, data?: any) => {
    console.debug(`${formatTime()} ${LOG_PREFIX} DEBUG ${msg}`, data ?? '')
  },
}
