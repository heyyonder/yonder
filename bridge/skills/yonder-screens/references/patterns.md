# The kit and common patterns

## The kit

Each page gets the kit: the CSS classes and the icons of Yonder. A page
with the kit looks like Yonder with no work, and follows each theme. You
need no `<link>`: the classes are in the page.

| Class | What it is |
|---|---|
| `y-page` | The body of a screen: a column of the full height, with `padding-bottom: var(--under)` for the home bar. |
| `y-scroll` | The part of the page that scrolls. |
| `y-bar` | A top bar of 52 px. |
| `y-title` | The title in a bar. |
| `y-section` | A heading over a list. |
| `y-list`, `y-row` | A list, and one row in it. |
| `y-num`, `y-name`, `y-sub`, `y-end` | The parts of a row: the number, the name, the second line, and the end. |
| `y-running`, `y-waiting`, `y-need`, `y-done`, `y-failed` | The status of a row or of a dot. |
| `y-dot` | A small dot in the color of its status. |
| `y-button` | A button. Add `y-primary` for the main button, `y-live` for a live call, `y-wide` for the full width. |
| `y-round` | A round icon button of 44 px. |
| `y-field` | A text box. |
| `y-tabs`, `y-tab` | A tab bar, and one tab. Set `aria-selected="true"` on the open tab. |
| `y-chat` | The column of a chat. |
| `y-bubble` | A message of the user. |
| `y-say` | A message of an agent. |
| `y-step` | A tool line in a chat. |
| `y-muted` | Text in the `--muted` color. |
| `y-icon` | An icon from `yonder.icon(name)`. |
| `<y-projects>` | The project switcher: a pill with the project and two small arrows. A tap opens the projects over the whole page (All projects, the starred ones, then the others), and a tap on a project picks it. To restyle it, its parts are `y-pill`, `y-projects-page`, `y-ptools` (the search), `y-prow` (with `y-on` on the selected project and `y-rest` over the first project that is not starred), `y-pick`, `y-pname`, and `y-star` (with `y-starred`). |

## A list of agents with the tabs Tasks, Done and Closed

```html
<div class="y-page">
  <header class="y-bar"><h1 class="y-title" id="title"></h1></header>
  <main class="y-scroll"><ul class="y-list" id="list"></ul></main>
  <nav class="y-tabs" id="tabs"></nav>
</div>
<script>
const w = yonder.word;
const TABS = [["run", w.Many], ["done", "Done"], ["closed", "Closed"]];
let tab = "run", open = [], closed = [], project = { path: "*" };
const inTab = (m) => (tab === "run" ? m.status === "running" : m.status !== "running");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => "&#" + c.charCodeAt(0) + ";");
function draw() {
  const all = (tab === "closed" ? closed : open.filter(inTab)).filter((m) => project.path === "*" || m.project === project.name);
  title.textContent = TABS.find((t) => t[0] === tab)[1];
  list.innerHTML = all.map((m) => `<li><button class="y-row y-${m.attention ? "need" : m.status}" data-id="${m.id}">
    <span class="y-num">${esc(m.label)}</span><span class="y-name">${esc(m.name)}</span>
    <span class="y-sub">${esc(m.next || m.activity || m.summary)}</span></button></li>`).join("");
  tabs.innerHTML = TABS.map(([id, label]) => `<button class="y-tab" data-tab="${id}" aria-selected="${id === tab}">${label}</button>`).join("");
}
tabs.onclick = async (e) => {
  const b = e.target.closest("[data-tab]");
  if (!b) return;
  tab = b.dataset.tab;
  if (tab === "closed") closed = await yonder.mice.closed();
  draw();
};
yonder.mice.on((list) => ((open = list), draw()));
Promise.all([yonder.mice.list(), yonder.projects.current()]).then(([list, p]) => {
  open = list;
  project = p;
  draw();
  yonder.ready();
});
</script>
```

## The project switcher

Use the switcher of the kit, the same as in the default screen:

```html
<div class="y-bar"><y-projects></y-projects></div>
```

```js
yonder.projects.on((p) => ((project = p), draw()));
```

Only when the user asks for an own switcher, draw it from the calls:

```js
async function pickProject() {
  const all = await yonder.projects.list();
  menu.innerHTML = [{ name: "All projects", path: "*" }, ...all]
    .map((p) => `<button class="y-row" data-path="${p.path}"><span class="y-name">${esc(p.name)}</span></button>`).join("");
}
menu.onclick = (e) => {
  const b = e.target.closest("[data-path]");
  if (b) yonder.projects.select(b.dataset.path);
};
yonder.projects.on((p) => ((project = p), draw()));
```

## An approval card

```js
async function drawApprovals() {
  const all = await yonder.approvals.list();
  cards.innerHTML = all.map((a) => `<section class="card">
    <p class="y-muted">${esc(yonder.word.One)} ${a.mouse}</p><p>${esc(a.title)}</p>
    ${a.rows.map((r) => `<p class="y-sub">${esc(r)}</p>`).join("")}
    <button class="y-button" data-id="${a.id}" data-allow="">Deny</button>
    <button class="y-button y-primary" data-id="${a.id}" data-allow="1">Allow</button></section>`).join("");
}
cards.onclick = (e) => {
  const b = e.target.closest("[data-id]");
  if (b) yonder.approvals.answer(b.dataset.id, !!b.dataset.allow).finally(drawApprovals);
};
yonder.mice.on(drawApprovals);
```

## The call button

```js
const callButton = document.querySelector("#call");
const show = (s) => {
  callButton.hidden = s.available === false; // a computer has no calls
  callButton.classList.toggle("y-live", s.phase !== "idle");
  callButton.innerHTML = yonder.icon("phone") + (s.phase === "idle" ? "Call" : "End");
};
callButton.onclick = async () => show((await yonder.call.state()).phase === "idle" ? await yonder.call.start() : await yonder.call.end());
yonder.call.on(show);
yonder.call.state().then(show);
```

## A chat that stays fresh

```js
let timer;
async function openChat(id) {
  clearInterval(timer);
  const draw = async () => {
    const turns = await yonder.chat.get(id);
    chat.innerHTML = turns.map((t) => `<div class="${t.who === "user" ? "y-bubble" : t.who === "tool" ? "y-step" : "y-say"}">${esc(t.text)}</div>`).join("");
  };
  await draw();
  timer = setInterval(draw, 3000);
}
```

## Own colors that follow the look

```css
.card { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: 16px; }
.card.active { outline: 2px solid var(--accent); }
:root[data-theme="dark"] .card { box-shadow: none; }
```

## An attach menu

A sheet of rows that calls `yonder.attach`, then sends the files with the
next message:

```js
let files = [];
const actions = { camera: "Camera", photo: "Photo", file: "File", paste: "Paste", location: "Location" };
sheet.innerHTML = Object.entries(actions).map(([k, t]) => `<button class="y-row" data-attach="${k}">${t}</button>`).join("");
sheet.onclick = async (e) => {
  const b = e.target.closest("[data-attach]");
  if (!b) return;
  sheet.hidden = true;
  const got = await yonder.attach[b.dataset.attach]();
  if (got) files.push(got.path);
};
send.onclick = () => yonder.mice.send(id, field.value, files).then(() => (files = [], (field.value = "")));
```

## A picker of the model

```js
const { models } = await yonder.mice.choices();
picker.innerHTML = models.map((m) => `<option value="${m.value}">${esc(m.label)}</option>`).join("");
picker.onchange = () => yonder.mice.send(id, ".", [], { model: picker.value });
```

## A control of your own

A page gets no native control. Draw it, and give it a size of 44 px or
more:

```html
<button class="switch" role="switch" aria-checked="false"><span></span></button>
<style>
.switch { width: 52px; height: 44px; border: 0; background: none; padding: 6px 0; }
.switch span { display: block; height: 32px; border-radius: 16px; background: var(--line); position: relative; }
.switch span::after { content: ""; position: absolute; top: 2px; left: 2px; width: 28px; height: 28px; border-radius: 50%; background: #fff; transition: transform .2s; }
.switch[aria-checked="true"] span { background: var(--accent); }
.switch[aria-checked="true"] span::after { transform: translateX(20px); }
</style>
```
