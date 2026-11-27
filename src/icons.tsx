// The icons of the app: one set of line icons (the paths of Lucide, ISC license), 16 px, a stroke of 2 px,
// in the color of the text. Text symbols such as ☀ or ⏏ looked different on each system, and iOS
// shows some of them as color emoji.
export const PATHS = {
  refresh: ["M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16", "M8 16H3v5"],
  sun: ["M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z", "M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41"],
  moon: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"],
  // The Saved tab, and the button that saves an agent for later or unsaves it.
  bookmark: ["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"],
  "bookmark-minus": ["m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z", "M15 10H9"],
  // Sliders, not a cogwheel (Lucide "sliders-horizontal").
  settings: ["M10 5H3", "M12 19H3", "M14 3v4", "M16 17v4", "M21 12h-9", "M21 19h-5", "M21 5h-7", "M8 10v4", "M8 12H3"],
  star: ["M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"],
  qr: [
    "M4 3h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
    "M17 3h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z",
    "M4 16h3a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z",
    "M21 16h-3a2 2 0 0 0-2 2v3", "M21 21v.01", "M12 7v3a2 2 0 0 1-2 2H7", "M3 12h.01", "M12 3h.01", "M12 16v.01", "M16 12h1", "M21 12v.01", "M12 21v-1",
  ],
  // A schedule of the Settings (Lucide "clock").
  clock: ["M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z", "M12 6v6l4 2"],
  history: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5", "M12 7v5l4 2"],
  camera: ["M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z", "M12 10a3 3 0 1 0 0 6 3 3 0 1 0 0-6z"],
  image: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M9 7a2 2 0 1 0 0 4 2 2 0 1 0 0-4z", "m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"],
  file: ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z", "M14 2v4a2 2 0 0 0 2 2h4"],
  pin: ["M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0", "M12 7a3 3 0 1 0 0 6 3 3 0 1 0 0-6z"],
  clipboard: ["M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z", "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"],
  link: ["M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71", "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"],
  paperclip: ["m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"],
  x: ["M18 6 6 18", "m6 6 12 12"],
  plus: ["M5 12h14", "M12 5v14"],
  up: ["m5 12 7-7 7 7", "M12 19V5"],
  down: ["m6 9 6 6 6-6"],
  back: ["m15 18-6-6 6-6"],
  forward: ["m9 18 6-6-6-6"],
  // The listen button of a conversation (Lucide "volume-2").
  volume: ["M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z", "M16 9a5 5 0 0 1 0 6", "M19.364 18.364a9 9 0 0 0 0-12.728"],
  search: ["m21 21-4.34-4.34", "M11 3a8 8 0 1 0 0 16 8 8 0 1 0 0-16z"],
  globe: ["M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20"],
  mic: ["M12 19v3", "M19 10v2a7 7 0 0 1-14 0v-2", "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"],
  micOff: ["M12 19v3", "M15 9.34V5a3 3 0 0 0-5.68-1.33", "M16.95 16.95A7 7 0 0 1 5 12v-2", "M18.89 13.23A7 7 0 0 0 19 12v-2", "m2 2 20 20", "M9 9v3a3 3 0 0 0 5.12 2.12"],
  folder: ["M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"],
  // The head of the Yonder bird: the outer and the inner edge of its head line, with the two feathers. A stroke of
  // 0.7 (STROKE) on these edges makes the filled line of the head in SOLID about 1.5 wide.
  bird: ["M13.74 5.71c-0.56 0-1.1 0.06-1.49 0.16 0.01-0.14 0.01-0.27 0.01-0.41 0-2.31-1.58-4.15-3.56-4.15-1.36 0-2.42 0.9-2.42 2.05 0 0.47 0.15 0.91 0.4 1.25-0.5-0.15-1.04-0.21-1.52-0.21-1.67 0.01-2.83 1.01-2.83 2.24 0 1.3 1.17 2.13 2.78 2.13 0.52 0 1.03-0.05 1.41-0.11-1.43 1.54-2.19 3.57-2.19 5.63 0 4.77 3.91 8.42 8.72 8.42 4.86 0 8.59-3.85 8.59-8.39 0.06-4.91-3.51-8.6-7.92-8.6z", "M13.08 21.9c-4.35 0-7.92-3.44-7.92-7.51 0-2.58 1.16-4.87 2.87-6.02 0.12-0.08 0.14-0.2 0.14-0.31 0-0.23-0.21-0.37-0.4-0.37-0.92 0.07-1.89 0.3-2.65 0.3-1.25 0-1.98-0.55-1.98-1.35 0-0.83 0.93-1.49 2.07-1.49 1.39 0 2.76 0.78 3.62 1.65 0.1 0.09 0.21 0.14 0.31 0.14 0.24 0 0.39-0.17 0.39-0.39 0-0.11-0.05-0.21-0.14-0.3-0.41-0.47-0.97-0.95-1.47-1.42-0.56-0.5-0.85-0.98-0.85-1.48 0-0.73 0.69-1.28 1.6-1.28 1.45 0.03 2.76 1.44 2.76 3.35 0 0.39-0.06 0.71-0.2 0.9-0.05 0.07-0.06 0.14-0.06 0.22 0 0.21 0.17 0.33 0.36 0.33 0.05 0 0.1-0.01 0.16-0.03 0.64-0.27 1.36-0.38 2.07-0.38 2.34 0 4.3 1.24 5.4 2.76-0.22-0.07-0.45-0.11-0.65-0.11-1.31 0-2.27 1.38-2.27 3.09 0 2.11 1.3 3.63 2.77 3.63 1.08 0 1.86-0.91 1.94-2.05 0 0.17 0 0.29 0 0.34-0.01 4.36-3.53 7.78-7.88 7.78z"],
  check: ["M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z", "m9 12 2 2 4-4"],
  tick: ["M20 6 9 17l-5-5"],
  // Rename in the three dots of an agent (Lucide "pencil").
  pencil: ["M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z", "m15 5 4 4"],
  download: ["M12 15V3", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "m7 10 5 5 5-5"],
  info: ["M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z", "M12 16v-4", "M12 8h.01"],
  // A closed door, for the Closed tab and the Close action.
  door: ["M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14", "M2 20h20", "M14 12v.01"],
  phone: ["M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384"],
  more: ["M12 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2z", "M19 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2z", "M5 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2z"],
  smartphone: ["M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z", "M12 18h.01"],
  grid: ["M4 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M15 3h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M15 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z", "M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z"],
  list: ["M3 5h.01", "M3 12h.01", "M3 19h.01", "M8 5h13", "M8 12h13", "M8 19h13"],
  archive: ["M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8", "M10 12h4"],
  restore: ["M3 3h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M4 8v11a2 2 0 0 0 2 2h2", "M20 8v11a2 2 0 0 1-2 2h-2", "m9 15 3-3 3 3", "M12 12v9"],
  trash: ["M10 11v6", "M14 11v6", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6", "M3 6h18", "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  cpu: ["M12 20v2", "M12 2v2", "M17 20v2", "M17 2v2", "M2 12h2", "M2 17h2", "M2 7h2", "M20 12h2", "M20 17h2", "M20 7h2", "M7 20v2", "M7 2v2", "M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M9 8h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"],
  message: ["M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"],
  wrench: ["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"],
  gauge: ["m12 14 4-4", "M3.34 19a10 10 0 1 1 17.32 0"],
  keyboard: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M6 8h.01", "M10 8h.01", "M14 8h.01", "M18 8h.01", "M8 12h.01", "M12 12h.01", "M16 12h.01", "M7 16h10"],
  shield: ["M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"],
  chevrons: ["m7 15 5 5 5-5", "m7 9 5-5 5 5"],
  stop: ["M8 6h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"],
  // The record button of the prompt box on the Mac (Lucide "circle-dot", with a larger dot).
  record: ["M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0z", "M9 12a3 3 0 1 0 6 0 3 3 0 0 0-6 0z"],
  play: ["M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"],
  // The controls of a video in the viewer (Lucide "pause" and "volume-x").
  pause: ["M15 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z", "M7 4h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"],
  // The buttons of a video that skip 10 seconds back and forward (Lucide "rotate-ccw" and "rotate-cw"), with no number.
  back10: ["M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8", "M3 3v5h5"],
  forward10: ["M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8", "M21 3v5h-5"],
  mute: ["M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z", "m22 9-6 6", "m16 9 6 6"],
  // The Canvas tab, Face ID on the button of an approval, and Share in the viewer of a page.
  layers: ["M12 2 2 7l10 5 10-5-10-5z", "m2 17 10 5 10-5", "m2 12 10 5 10-5"],
  faceid: ["M3 7V5a2 2 0 0 1 2-2h2", "M17 3h2a2 2 0 0 1 2 2v2", "M21 17v2a2 2 0 0 1-2 2h-2", "M7 21H5a2 2 0 0 1-2-2v-2", "M8 14s1.5 2 4 2 4-2 4-2", "M9 9h.01", "M15 9h.01"],
  share: ["M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8", "m16 6-4-4-4 4", "M12 2v13"],
  // The icons of the apps of the Canvas tab (Lucide 1.60.0): the user picks one, and a style with plain icons, such as
  // Terminal, picks one from the name of each app (`appGlyph` in src/Canvas.tsx).
  app: ["M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2z", "M10 4v4", "M2 8h20", "M6 4v4"],
  doc: ["M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z", "M14 2v5a1 1 0 0 0 1 1h5", "M10 9H8", "M16 13H8", "M16 17H8"],
  chart: ["M3 3v16a2 2 0 0 0 2 2h16", "M18 17V9", "M13 17V5", "M8 17v-3"],
  trend: ["M3 3v16a2 2 0 0 0 2 2h16", "m19 9-5 5-4-4-3 3"],
  table: ["M12 3v18", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2z", "M3 9h18", "M3 15h18"],
  calendar: ["M8 2v3", "M16 2v3", "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2z", "M3 9h18"],
  map: ["M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z", "M15 5.764v15", "M9 3.236v15"],
  weather: ["M12 2v2", "m4.93 4.93 1.41 1.41", "M20 12h2", "m19.07 4.93-1.41 1.41", "M15.947 12.65a4 4 0 0 0-5.925-4.128", "M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"],
  house: ["M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8", "M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"],
  building: ["M10 12h4", "M10 8h4", "M14 21v-3a2 2 0 0 0-4 0v3", "M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2", "M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"],
  cart: ["m2.05 2.05 1.099-.028a1 1 0 0 1 1.008.815l2.69 14.347A1 1 0 0 0 7.83 18H18", "M4.563 5h16.435a1 1 0 0 1 .981 1.204l-1.026 6.226A2 2 0 0 1 18.962 14H6.25", "M18 18a2 2 0 1 0 0 4 2 2 0 1 0 0-4z", "M8 18a2 2 0 1 0 0 4 2 2 0 1 0 0-4z"],
  card: ["M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2z", "M2 10L22 10", "M6 14h2"],
  wallet: ["M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1", "M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"],
  users: ["M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2", "M16 3.128a4 4 0 0 1 0 7.744", "M22 21v-2a4 4 0 0 0-3-3.87", "M9 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8z"],
  user: ["M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2", "M12 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8z"],
  mail: ["m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7", "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-12a2 2 0 0 1 2-2z"],
  film: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2z", "M7 3v18", "M3 7.5h4", "M3 12h18", "M3 16.5h4", "M17 3v18", "M17 7.5h4", "M17 16.5h4"],
  music: ["M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19", "M18 13a3 3 0 1 0 0 6 3 3 0 1 0 0-6z", "M6 16a3 3 0 1 0 0 6 3 3 0 1 0 0-6z"],
  book: ["M12 5v16", "M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"],
  palette: ["M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z", "M13.5 6a0.5 0.5 0 1 0 0 1 0.5 0.5 0 1 0 0-1z", "M17.5 10a0.5 0.5 0 1 0 0 1 0.5 0.5 0 1 0 0-1z", "M6.5 12a0.5 0.5 0 1 0 0 1 0.5 0.5 0 1 0 0-1z", "M8.5 7a0.5 0.5 0 1 0 0 1 0.5 0.5 0 1 0 0-1z"],
  monitor: ["M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-10a2 2 0 0 1 2-2z", "M8 21L16 21", "M12 17L12 21"],
  code: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"],
  terminal: ["M12 19h8", "m4 17 6-6-6-6"],
  database: ["M12 2a9 3 0 1 0 0 6 9 3 0 1 0 0-6z", "M3 5V19A9 3 0 0 0 21 19V5", "M3 12A9 3 0 0 0 21 12"],
  server: ["M4 2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z", "M4 14h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-16a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z", "M6 6L6.01 6", "M6 18L6.01 18"],
  bot: ["M12 8V4H8", "M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z", "M2 14h2", "M20 14h2", "M15 13v2", "M9 13v2"],
  flask: ["M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2", "M6.453 15h11.094", "M8.5 2h7"],
  bug: ["M12 20v-9", "M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z", "M14.12 3.88 16 2", "M21 21a4 4 0 0 0-3.81-4", "M21 5a4 4 0 0 1-3.55 3.97", "M22 13h-4", "M3 21a4 4 0 0 1 3.81-4", "M3 5a4 4 0 0 0 3.55 3.97", "M6 13H2", "m8 2 1.88 1.88", "M9 7.13V6a3 3 0 1 1 6 0v1.13"],
  cog: ["M11 10.27 7 3.34", "m11 13.73-4 6.93", "M12 22v-2", "M12 2v2", "M14 12h8", "m17 20.66-1-1.73", "m17 3.34-1 1.73", "M2 12h2", "m20.66 17-1.73-1", "m20.66 7-1.73 1", "m3.34 17 1.73-1", "m3.34 7 1.73 1", "M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4z", "M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16z"],
  rocket: ["M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5", "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09", "M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z", "M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"],
  zap: ["M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"],
  heart: ["M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"],
  gift: ["M12 7v14", "M20 11v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8", "M7.5 7a1 1 0 0 1 0-5A4.8 8 0 0 1 12 7a4.8 8 0 0 1 4.5-5 1 1 0 0 1 0 5", "M4 7h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"],
  utensils: ["M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2", "M7 2v20", "M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"],
  coffee: ["M10 2v2", "M14 2v2", "M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1", "M6 2v2"],
  car: ["M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2", "M7 15a2 2 0 1 0 0 4 2 2 0 1 0 0-4z", "M9 17h6", "M17 15a2 2 0 1 0 0 4 2 2 0 1 0 0-4z"],
  plane: ["M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"],
  dumbbell: ["M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z", "m2.5 21.5 1.4-1.4", "m20.1 3.9 1.4-1.4", "M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z", "m9.6 14.4 4.8-4.8"],
  leaf: ["M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20", "M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"],
  game: ["M6 11L10 11", "M8 9L8 13", "M15 12L15.01 12", "M18 10L18.01 10", "M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"],
  school: ["M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z", "M22 10v6", "M6 12.5V16a6 3 0 0 0 12 0v-3.5"],
  news: ["M15 18h-5", "M18 14h-8", "M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9a2 2 0 0 1 2-2h2", "M11 6h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z"],
  todo: ["M13 5h8", "M13 12h8", "M13 19h8", "m3 17 2 2 4-4", "m3 7 2 2 4-4"],
  target: ["M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z", "M12 6a6 6 0 1 0 0 12 6 6 0 1 0 0-12z", "M12 10a2 2 0 1 0 0 4 2 2 0 1 0 0-4z"],
  trophy: ["M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2", "M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2", "M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3", "M4 22h16", "M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z", "M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3"],
  sofa: ["M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3", "M2 16a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z", "M4 18v2", "M20 18v2", "M12 4v9"],
  box: ["M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z", "m3.3 7 8.7 5 8.7-5", "M12 22V12"],
  shapes: ["M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z", "M4 14h5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1z", "M17.5 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7z"],
};

// The filled shapes of an icon, drawn over its lines. The bird is the head of the Yonder bird, with its two feathers,
// its eyes that look to the side and its beak. Visual Sandbox drew it from the logo, the mascot and the old icon
// (vector/quiver-arrow-2). Its lines are filled shapes, about 0.8 px wide.
const SOLID: Partial<Record<keyof typeof PATHS, string[]>> = {
  bird: ["M13.74 5.71c-0.56 0-1.1 0.06-1.49 0.16 0.01-0.14 0.01-0.27 0.01-0.41 0-2.31-1.58-4.15-3.56-4.15-1.36 0-2.42 0.9-2.42 2.05 0 0.47 0.15 0.91 0.4 1.25-0.5-0.15-1.04-0.21-1.52-0.21-1.67 0.01-2.83 1.01-2.83 2.24 0 1.3 1.17 2.13 2.78 2.13 0.52 0 1.03-0.05 1.41-0.11-1.43 1.54-2.19 3.57-2.19 5.63 0 4.77 3.91 8.42 8.72 8.42 4.86 0 8.59-3.85 8.59-8.39 0.06-4.91-3.51-8.6-7.92-8.6zm-0.66 16.19c-4.35 0-7.92-3.44-7.92-7.51 0-2.58 1.16-4.87 2.87-6.02 0.12-0.08 0.14-0.2 0.14-0.31 0-0.23-0.21-0.37-0.4-0.37-0.92 0.07-1.89 0.3-2.65 0.3-1.25 0-1.98-0.55-1.98-1.35 0-0.83 0.93-1.49 2.07-1.49 1.39 0 2.76 0.78 3.62 1.65 0.1 0.09 0.21 0.14 0.31 0.14 0.24 0 0.39-0.17 0.39-0.39 0-0.11-0.05-0.21-0.14-0.3-0.41-0.47-0.97-0.95-1.47-1.42-0.56-0.5-0.85-0.98-0.85-1.48 0-0.73 0.69-1.28 1.6-1.28 1.45 0.03 2.76 1.44 2.76 3.35 0 0.39-0.06 0.71-0.2 0.9-0.05 0.07-0.06 0.14-0.06 0.22 0 0.21 0.17 0.33 0.36 0.33 0.05 0 0.1-0.01 0.16-0.03 0.64-0.27 1.36-0.38 2.07-0.38 2.34 0 4.3 1.24 5.4 2.76-0.22-0.07-0.45-0.11-0.65-0.11-1.31 0-2.27 1.38-2.27 3.09 0 2.11 1.3 3.63 2.77 3.63 1.08 0 1.86-0.91 1.94-2.05 0 0.17 0 0.29 0 0.34-0.01 4.36-3.53 7.78-7.88 7.78zm7.06-7.14c-0.26 0.35-0.65 0.54-1.06 0.54-1.23 0-2.21-1.49-2.21-3.14 0-1.53 0.79-2.5 1.72-2.5 0.34 0 0.66 0.13 0.84 0.31-0.5 0.38-0.69 1.14-0.68 2l1.28 0.49-0.89 0.92c0.14 0.57 0.56 1.1 1.01 1.37z", "M12.48 9.44c-1.89 0-3.13 1.78-3.13 3.88 0 2.42 1.59 4.16 3.45 4.16 1.87 0 3.07-1.75 3.07-3.79 0.01-2.53-1.53-4.26-3.4-4.26zm0.4 7.42c-1.63 0-2.87-1.65-2.87-3.59 0-1.99 1.14-3.24 2.46-3.24 0.47 0 0.88 0.14 1.14 0.35-0.65 0.47-0.97 1.41-0.93 2.32l1.74 0.58-1.28 1.13c0.19 0.71 0.79 1.44 1.39 1.68-0.4 0.48-1.02 0.77-1.65 0.77z", "M17.35 15.72l-1.86 0.98c-0.17 0.1-0.16 0.34 0.01 0.42l1.82 0.98c0.15 0.08 0.3 0 0.32-0.17l0.24-1.75c0.05-0.38-0.23-0.58-0.52-0.46z"],
};

// A stroke around the filled shapes. It rounds the eyes and the beak of the bird, and keeps the eyes open.
const SOLID_STROKE: Partial<Record<keyof typeof PATHS, number>> = { bird: 0.3 };

// The stroke of the lines, when it is not 2 px.
const STROKE: Partial<Record<keyof typeof PATHS, number>> = { bird: 0.7 };

// A smaller view box draws an icon larger than its box. The bird is drawn at about 28 px in a box of 24 px, so its
// line of about 1.5 shows at about 1.75 px. It sits 1.9 px higher, so its bottom is on the bottom of the Done
// circle. Its edges go a little out of the box, so the svg does not clip them.
const VIEW: Partial<Record<keyof typeof PATHS, string>> = { bird: "1.7 3.32 20.6 20.6" };

// An icon of the app, or an icon from SVG markup (`iconFor`).
type Drawn = keyof typeof PATHS;
export type IconName = Drawn | `svg-${string}`;

// Icons from SVG markup, such as the icon of `agentName` in config.json (src/names.ts), by name. The name is "svg-" and
// a hash of the markup, so a new design is a new name for the caches of the page and of the native side (src/chrome.ts),
// and shows with no new build. Only its shape counts: it takes the color of the text, as the other icons. An agent can
// design and change the icon at any time.
const MARKUP = new Map<string, string>();
// `icon` is SVG markup or the name of an icon of the app. Else, and for markup that is not an SVG, the icon is `fallback`.
export function iconFor(icon: string | undefined, fallback: Drawn): IconName {
  if (icon && icon in PATHS) return icon as Drawn;
  if (!icon?.trim().startsWith("<svg")) return fallback;
  let hash = 0;
  for (let i = 0; i < icon.length; i++) hash = (hash * 31 + icon.charCodeAt(i)) | 0;
  const name = `svg-${(hash >>> 0).toString(36)}` as const;
  if (MARKUP.has(name)) return name;
  // A box of 24 px, as the view box of the other icons, so that the PNG of `iconPng` draws it at the same size.
  const doc = new DOMParser().parseFromString(icon.trim().replace(/^<svg(?![^>]*\bxmlns=)/, '<svg xmlns="http://www.w3.org/2000/svg"'), "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.localName !== "svg" || doc.querySelector("parsererror")) return fallback;
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  MARKUP.set(name, new XMLSerializer().serializeToString(svg));
  return name;
}
const dataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function Icon({ name, size = 16, filled }: { name: IconName; size?: number; filled?: boolean }) {
  // The markup is a mask over the color of the text, so it takes the color of the theme, and its scripts never run.
  const markup = MARKUP.get(name);
  if (markup) {
    const mask = `url("${dataUrl(markup)}") center / contain no-repeat`;
    return <svg className="svg-icon" width={size} height={size} style={{ background: "currentColor", WebkitMask: mask, mask }} aria-hidden />;
  }
  if (!(name in PATHS)) return null;
  const n = name as Drawn;
  return (
    <svg
      className="svg-icon"
      width={size}
      height={size}
      viewBox={VIEW[n] ?? "0 0 24 24"}
      overflow={VIEW[n] ? "visible" : undefined}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={STROKE[n] ?? 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[n].map((d) => <path key={d} d={d} />)}
      {SOLID[n]?.map((d) => (
        <path key={d} d={d} fill="currentColor" stroke={SOLID_STROKE[n] ? "currentColor" : "none"} strokeWidth={SOLID_STROKE[n]} fillRule="evenodd" />
      ))}
    </svg>
  );
}

// An icon as a PNG in base64, black on clear, for the native controls of the iPhone (src/chrome.ts). The native side
// gives it the color of the text, as `currentColor` does here. The PNG has a margin of a tenth of the box on each side,
// so that the bird, which goes a little out of its box, is not cut. ChromeIcon (GlassButton.swift) draws it 1.2 times
// as large as the box.
const pngs = new Map<IconName, Promise<string>>();
export function iconPng(name: IconName): Promise<string> {
  const known = pngs.get(name);
  if (known) return known;
  const n = (name in PATHS ? name : "bird") as Drawn;
  const [x, y, w, h] = (VIEW[n] ?? "0 0 24 24").split(" ").map(Number);
  const pad = w / 10;
  const lines = PATHS[n].map((d) => `<path d="${d}"/>`);
  const solid = (SOLID[n] ?? []).map(
    (d) => `<path d="${d}" fill="#000" stroke="${SOLID_STROKE[n] ? "#000" : "none"}" stroke-width="${SOLID_STROKE[n] ?? 0}" fill-rule="evenodd"/>`,
  );
  // An icon from markup sits in the same box of 24 px, with the same margin.
  const markup = MARKUP.get(name);
  const svg = markup
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="-2.4 -2.4 28.8 28.8">${markup}</svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}"` +
      ` fill="none" stroke="#000" stroke-width="${STROKE[n] ?? 2}" stroke-linecap="round" stroke-linejoin="round">${lines.join("")}${solid.join("")}</svg>`;
  const png = new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 120;
      canvas.getContext("2d")?.drawImage(image, 0, 0, 120, 120);
      resolve(canvas.toDataURL("image/png").split(",")[1]);
    };
    image.onerror = () => reject(new Error(`The icon ${name} did not draw.`));
    image.src = dataUrl(svg);
  });
  pngs.set(name, png);
  return png;
}
