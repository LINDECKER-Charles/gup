import type { SecondFactorStore } from "../../src/ports/second-factor-store.js";

export class MemorySecondFactorStore implements SecondFactorStore {
  lastCounter: number | null = null;

  async claim(counter: number): Promise<boolean> {
    if (this.lastCounter !== null && counter <= this.lastCounter) return false;
    this.lastCounter = counter;
    return true;
  }
}
