declare module "t-a-i" {
  declare class MillisConverter {
    constructor(data: any, model: symbol);
    atomicToUnix(atomicMillis: number): number;
    unixToAtomic(
      unixMillis: number,
      options: { array?: boolean, range?: boolean }
    ): number;
  }

  export const UNIX_START: number;
  export const UNIX_END: number;
  export const MODELS: {
    OVERRUN: symbol;
    BREAK: symbol;
    STALL: symbol;
    SMEAR: symbol;
  }
  export function TaiConverter(model: symbol): MillisConverter;
}
