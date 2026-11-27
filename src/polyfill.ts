// An Android phone with an old System WebView (Chrome 90, Sentry YONDER-3, YONDER-4, YONDER-5) has no
// crypto.randomUUID and no Array.prototype.at, and the build does not add them. main.tsx imports this first.
// shortcut: only these two, add the next one when Sentry names it.
if (!Array.prototype.at)
  Object.defineProperty(Array.prototype, "at", {
    configurable: true,
    writable: true,
    value(this: unknown[], i: number) {
      i = Math.trunc(i) || 0;
      return this[i < 0 ? this.length + i : i];
    },
  });
if (!crypto.randomUUID)
  crypto.randomUUID = () => {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
  };

export {};
