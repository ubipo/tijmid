export function passthroughTaggedLiteral(
  strings: TemplateStringsArray, ...expressions: string[]
) {
  return [strings[0], ...expressions.flatMap(
    (exp, i) => [exp, strings[i + 1]]
  )].join("")
}
