export const partition = <T>(
  array: T[],
  predicate: (element: T, index: number, array: T[]) => boolean
) => array.reduce((acc, element, i) => {
  const [partA, partB] = acc;
  (predicate(element, i, array) ? partA : partB).push(element)
  return acc
}, [[], []] as [T[], T[]])

export const extract = <T>(
  array: T[],
  predicate: (element: T, index: number, array: T[]) => boolean
): [T, T[]] => {
  const [partA, partB] = partition(array, predicate)
  if (partA.length !== 1) {
    throw new Error(`Expected exactly one element to match predicate, got ${partA.length}`)
  }
  return [partA[0], partB]
}
