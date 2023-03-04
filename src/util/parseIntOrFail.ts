export default function parseIntOrFail(str: string) {
  const int = parseInt(str, 10)
  if (isNaN(int)) { throw new TypeError(`Not an integer: ${str}`) }
  return int
}
