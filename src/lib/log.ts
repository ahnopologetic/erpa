const LOG_PREFIX = '[Erpa]'
const isVerbose = process.env.NODE_ENV !== 'production'
const log = (...args: unknown[]) => {
    if (isVerbose) console.log(LOG_PREFIX, ...args)
}
const warn = (...args: unknown[]) => console.warn(LOG_PREFIX, ...args)
const err = (...args: unknown[]) => console.error(LOG_PREFIX, ...args)
const timeStart = (label: string) => ({ label, start: performance.now() })
const timeEnd = (t: { label: string; start: number }) => {
    log(`${t.label} in ${(performance.now() - t.start).toFixed(0)} ms`)
}

export {
    isVerbose,
    log,
    warn,
    err,
    timeStart,
    timeEnd
}