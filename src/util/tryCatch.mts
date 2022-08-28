export function tryCatch<T>(
  block: () => T, Exception: any, catchBlock: () => never
) {
  try {
    return block()
  } catch (error) {
    if (error instanceof Exception) {
      catchBlock()
    }
    throw error
  }
}
