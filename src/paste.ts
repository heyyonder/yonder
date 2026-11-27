// What a paste in the window does. A copied file asks the bridge for its path. WebKit hides that path.
// "skip" leaves the paste to the text field. "paths" reads the pasteboard. "plain" uses the text and the images.
export type PastePlan = "skip" | "paths" | "plain";

export function pastePlan(o: { inPad: boolean; inField: boolean; images: boolean; copied: boolean; text: boolean; phone: boolean }): PastePlan {
  // A paste into a real text field keeps its text. The hidden text area never keeps any.
  if (!o.images && !o.inPad && !o.copied && o.text) return "skip";
  if (!o.images && !o.inPad && !o.inField && !o.copied) return "skip";
  // A copied file has no text that the page can read. A screenshot still has no file path, and "plain" attaches it.
  if (!o.phone && (o.copied || !o.text)) return "paths";
  return "plain";
}
