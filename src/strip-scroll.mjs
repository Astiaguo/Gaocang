export class VersionStripScroll {
  constructor() { this.positions = new Map(); }
  capture(strip) {
    if (strip?.dataset.groupId) this.positions.set(strip.dataset.groupId,Math.max(0,strip.scrollLeft));
  }
  restore(strip) {
    const saved = this.positions.get(strip.dataset.groupId) ?? 0;
    strip.scrollLeft = Math.min(saved,Math.max(0,strip.scrollWidth - strip.clientWidth));
  }
}
