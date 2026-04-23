export class PokerEngineError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PokerEngineError";
    this.code = code;
  }
}

export function invariant(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) {
    throw new PokerEngineError(code, message);
  }
}
