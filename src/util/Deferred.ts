class Deferred<T> {
  constructor(
    public resolve: (value: T) => void,
    public reject: (reason: any) => void
  ) {}
}

export default function createDeferred<T>() {
  let resolve: (value: T) => void
  let reject: (reason?: any) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, deferred: new Deferred(resolve!, reject!) };
}
