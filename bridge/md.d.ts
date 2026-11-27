// A Markdown file imported `with { type: "file" }` gives its path (about_yonder in main.ts).
declare module "*.md" {
  const path: string;
  export default path;
}
// An SVG file imported the same way gives its path too (the icon of ~/Yonder in main.ts).
declare module "*.svg" {
  const path: string;
  export default path;
}
