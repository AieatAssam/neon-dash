/** FIFO cache bounded by both entry count and backing-store pixel count. */
export class GlowCache<T> {
 private entries = new Map<string, { value: T; pixels: number }>();
 private pixels = 0;
 constructor(private maxPixels: number, private maxEntries: number) {}
 get(key: string): T | undefined { return this.entries.get(key)?.value; }
 set(key: string, value: T, pixels: number): void {
  const existing = this.entries.get(key);
  if (existing) { this.pixels -= existing.pixels; this.entries.delete(key); }
  if (pixels > this.maxPixels || this.maxEntries <= 0) return;
  while (this.entries.size && (this.entries.size >= this.maxEntries || this.pixels + pixels > this.maxPixels)) {
   const oldest = this.entries.keys().next().value!;
   this.pixels -= this.entries.get(oldest)!.pixels;
   this.entries.delete(oldest);
  }
  this.entries.set(key, { value, pixels }); this.pixels += pixels;
 }
}
