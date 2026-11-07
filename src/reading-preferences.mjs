const storageKey = 'gaocang-reading-font-size-v1';
const defaultSize = 17, minSize = 14, maxSize = 28;

export class ReadingPreferences {
  constructor(storage) {
    this.storage = storage;
    this.size = defaultSize;
    this.remembered = Boolean(storage);
    try {
      const saved = Number(storage?.getItem(storageKey));
      if (Number.isInteger(saved) && saved >= minSize && saved <= maxSize) this.size = saved;
    } catch { this.remembered = false; }
  }
  get canDecrease() { return this.size > minSize; }
  get canIncrease() { return this.size < maxSize; }
  adjust(direction) {
    this.size = Math.max(minSize, Math.min(maxSize, this.size + Math.sign(direction)));
    return this.save();
  }
  reset() { this.size = defaultSize; return this.save(); }
  save() {
    try {
      if (!this.storage) throw new Error('storage unavailable');
      this.storage.setItem(storageKey, String(this.size)); this.remembered = true;
    } catch { this.remembered = false; }
    return this.size;
  }
}
