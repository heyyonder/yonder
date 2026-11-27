// Uploads from the code tool of the Claude app (create_upload): a link for one file, for 2 hours, through the relay at
// https://mcp.yonder.so/<id>/upload/<token>. Cloudflare and the relay end HTTPS for the connector, so the client
// encrypts each part to this computer: X25519 with the key of the upload, SHA-256 of the shared secret as the key of
// AES-256-CTR, and the number of the first block of the part as the IV. A part is base64 text, because the relay passes
// text bodies of 1 MiB at most. Each part names its client key (X-Key), so a second run with a new key sends only the
// missing parts. send.sh does all of it with bash, openssl and curl, in the background, and shows the progress for up to
// 60 seconds, because a code tool of the Claude app ends a command after a few minutes and then gives no output. Check:
// `bun bridge/upload.ts`.
import { closeSync, existsSync, openSync, readFileSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";

export const PART = 720 * 1024; // Base64 makes 983,040 bytes of it, under the 1 MiB of the relay. A multiple of 16.
const TIME = 2 * 60 * 60_000;

// key: the private key of the upload (PKCS8 PEM), gone after the upload. file: where the bytes go, after the first part.
type Upload = { worker: string; message: string; until: number; key?: string; pub: string; name?: string; size?: number; file?: string; have: number[]; done?: unknown };
type Options = {
  max: number;
  // Where the file of an upload goes, from its name.
  place: (u: Upload, name: string) => string;
  // The work after the last part, such as the keyframes of a video and the message to the agent. Gives the result.
  finish: (u: Upload & { file: string; name: string }) => Promise<unknown>;
};

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const text = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
const parts = (size: number) => Math.max(1, Math.ceil(size / PART));
// The IV of AES-CTR for the part that starts at byte `start`: the number of its first block, as 16 bytes.
const ivAt = (start: number) => Buffer.from(BigInt(start / 16).toString(16).padStart(32, "0"), "hex");

export function startUploads(file: string, o: Options) {
  const all: Record<string, Upload> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const save = () => writeFileSync(file, JSON.stringify(all), { mode: 0o600 });
  const finishing = new Map<string, Promise<unknown>>();
  // A link that ran out goes, and with it the parts of a file that never came whole.
  const prune = () => {
    for (const [h, u] of Object.entries(all))
      if (u.until < Date.now()) {
        if (!u.done && u.file) rmSync(dirname(u.file), { recursive: true, force: true });
        delete all[h];
      }
    save();
  };
  prune();

  return {
    create(worker: string, message: string) {
      prune();
      const token = randomBytes(24).toString("base64url");
      const { privateKey, publicKey } = generateKeyPairSync("x25519");
      all[hash(token)] = {
        worker,
        message,
        until: Date.now() + TIME,
        key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        pub: publicKey.export({ type: "spki", format: "pem" }).toString(),
        have: [],
      };
      save();
      return { token, until: new Date(Date.now() + TIME).toISOString() };
    },
    // A request to /upload/<token>, or /upload/<token>/send.sh. `base` is the address of the upload, as the client sees it.
    async handle(req: Request, rest: string, base: string) {
      const [token, script] = rest.split("/");
      const h = hash(token ?? "");
      const u = all[h];
      if (!u || u.until < Date.now()) return text(404, "This upload link is not valid, or its 2 hours are over. Call create_upload of Yonder again.");
      const url = new URL(req.url);
      if (script === "send.sh") return text(200, sendScript(base, u.pub));
      if (req.method === "GET" && url.searchParams.has("missing")) {
        // The numbers of the parts that are not here yet, one on each line, for a file of `missing` bytes.
        const size = Number(url.searchParams.get("missing"));
        if (u.done) return text(200, "");
        if (!(size > 0) || (u.size && size !== u.size)) return text(409, `The file of this link has ${u.size} bytes.`);
        return text(200, [...Array(parts(size)).keys()].filter((i) => !u.have.includes(i)).map((i) => `${i}\n`).join(""));
      }
      if (req.method === "GET" && url.searchParams.has("progress")) {
        // One line for the person: the megabytes that came, or "done" and the result.
        if (u.done) return text(200, `done ${JSON.stringify(u.done)}`);
        const mb = (n: number) => Math.round(n / 1e6);
        if (!u.size) return text(200, "0 MB");
        const all = u.have.length === parts(u.size);
        return text(200, `${mb(Math.min(u.have.length * PART, u.size))}/${mb(u.size)} MB${all ? ", Yonder makes the keyframes and gives the file to the agent" : ""}`);
      }
      if (req.method === "GET") return json({ name: u.name, size: u.size, parts: u.size ? parts(u.size) : undefined, have: u.have.length, done: u.done ?? false });
      if (u.done) return json(u.done);
      if (req.method === "PUT") {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(req.headers.get("content-range") ?? "");
        if (!range) return text(400, "Give Content-Range: bytes START-END/SIZE.");
        const [start, end, size] = range.slice(1).map(Number);
        const length = end - start + 1;
        if (size > o.max) return text(413, `Send a file of ${o.max / 1e9} GB or less.`);
        if (u.size && size !== u.size) return text(409, `The file of this link has ${u.size} bytes.`);
        if (start % PART || end >= size || (length !== PART && end !== size - 1)) return text(400, `Each part starts at a multiple of ${PART} bytes and has ${PART} bytes, or the rest of the file.`);
        let bytes: Buffer;
        try {
          const key = createHash("sha256")
            .update(diffieHellman({ privateKey: createPrivateKey(u.key!), publicKey: createPublicKey({ key: Buffer.from(req.headers.get("x-key") ?? "", "base64"), format: "der", type: "spki" }) }))
            .digest();
          const decipher = createDecipheriv("aes-256-ctr", key, ivAt(start));
          bytes = Buffer.concat([decipher.update(Buffer.from(await req.text(), "base64")), decipher.final()]);
        } catch {
          return text(400, "Give X-Key: the X25519 public key of the client, as base64 DER.");
        }
        if (bytes.length !== length) return text(400, `The part has ${bytes.length} bytes, not ${length}.`);
        if (!u.file) {
          u.name = (url.searchParams.get("name") ?? "").replace(/[^\w. -]/g, "_").replace(/^\.+/, "") || "file";
          u.size = size;
          u.file = o.place(u, u.name);
        }
        const fd = openSync(u.file, existsSync(u.file) ? "r+" : "w");
        try {
          writeSync(fd, bytes, 0, bytes.length, start);
        } finally {
          closeSync(fd);
        }
        if (!u.have.includes(start / PART)) u.have.push(start / PART);
        save();
        return json({ have: u.have.length, parts: parts(size) });
      }
      if (req.method === "POST" && url.searchParams.has("done")) {
        const missing = u.size ? parts(u.size) - u.have.length : 1;
        if (missing) return json({ missing }, 409);
        // The last part can come two times, so the work runs one time.
        let run = finishing.get(h);
        if (!run) {
          finishing.set(h, (run = o.finish(u as Upload & { file: string; name: string })));
          run.then(
            (done) => ((u.done = done), delete u.key, save()),
            () => finishing.delete(h),
          );
        }
        return run.then((done) => json(done), (e) => text(500, (e as Error).message));
      }
      return text(405, "Use GET, PUT or POST ?done.");
    },
  };
}

// The script of the client: bash send.sh FILE. It needs bash, openssl 1.1.1 or newer, curl 7.71 or newer and coreutils.
// The sender runs in the background (--send), 16 parts at a time, and a part that fails goes again. The command shows the
// progress for up to 60 seconds, then ends. A second run only shows the progress, or starts the sender again when it
// stopped, and the sender sends only the missing parts. A command that shows no output for some minutes can be stopped by
// the code tool of the Claude app, also while a long upload still goes on.
function sendScript(base: string, pub: string) {
  return `#!/usr/bin/env bash
# Sends one file to Yonder on the computer of the user, encrypted to that computer: bash send.sh FILE
# It sends in the background and shows the progress for up to 60 seconds. Run the same command again to see more.
set -euo pipefail
F="\${1:?Give the file: bash send.sh FILE}"
U='${base}'
P=${PART}
J=\${YONDER_JOBS:-16}
WAIT=\${YONDER_WAIT:-60}
D="\${TMPDIR:-/tmp}/yonder-upload-\${U##*/}"
mkdir -p "$D"
if [ "\${2:-}" = --send ]; then
  echo $$ > "$D/pid"
  cat > "$D/mac.pem" <<'KEY'
${pub.trim()}
KEY
  openssl genpkey -algorithm X25519 -out "$D/me.pem" 2>/dev/null
  X=$(openssl pkey -in "$D/me.pem" -pubout -outform DER | base64 | tr -d '\\n')
  K=$(openssl pkeyutl -derive -inkey "$D/me.pem" -peerkey "$D/mac.pem" | openssl dgst -sha256 -binary | od -An -tx1 | tr -d ' \\n')
  rm -f "$D/me.pem"
  S=$(stat -c %s "$F" 2>/dev/null || stat -f %z "$F")
  NAME=$(basename "$F" | sed 's/[^A-Za-z0-9._-]/_/g')
  export F U P S K X NAME
  part() {
    local s=$(( $1 * P ))
    local e=$(( s + P - 1 ))
    if (( e >= S )); then e=$(( S - 1 )); fi
    dd if="$F" bs=$P skip=$1 count=1 2>/dev/null \\
      | openssl enc -aes-256-ctr -K "$K" -iv "$(printf '%032x' $(( s / 16 )))" \\
      | base64 | tr -d '\\n' \\
      | curl -fsS --retry 5 --retry-all-errors -X PUT -H "Content-Range: bytes $s-$e/$S" -H "X-Key: $X" -H 'Content-Type: text/plain' --data-binary @- "$U?name=$NAME" > /dev/null
  }
  export -f part
  for try in 1 2 3; do
    curl -fsS "$U?missing=$S" | xargs -P "$J" -I{} bash -c 'part {}' || true
    if curl -fsS -X POST "$U?done"; then exit 0; fi
  done
  echo "Yonder did not get the whole file."
  exit 1
fi
# The sender, unless it runs already.
if ! { [ -f "$D/pid" ] && kill -0 "$(cat "$D/pid")" 2>/dev/null; }; then
  curl -fsS "$U/send.sh" -o "$D/send.sh"
  if command -v setsid > /dev/null; then
    nohup setsid bash "$D/send.sh" "$F" --send > "$D/log" 2>&1 < /dev/null &
  else
    nohup bash "$D/send.sh" "$F" --send > "$D/log" 2>&1 < /dev/null &
  fi
  echo $! > "$D/pid"
  echo "Yonder: sending $(basename "$F") in the background, $J parts at a time."
fi
# The progress, for up to WAIT seconds.
last=
for (( t = 0; t < WAIT; t += 3 )); do
  L=$(curl -fsS "$U?progress" || echo "no answer from Yonder")
  case "$L" in done*) echo "\${L#done }"; exit 0 ;; esac
  if [ "$L" != "$last" ]; then echo "$L"; last=$L; fi
  if ! kill -0 "$(cat "$D/pid")" 2>/dev/null; then
    sleep 2
    L=$(curl -fsS "$U?progress" || true)
    case "$L" in done*) echo "\${L#done }"; exit 0 ;; esac
    echo "The sender stopped: $(tail -1 "$D/log" 2>/dev/null). Run the same command again: it sends only the missing parts."
    exit 1
  fi
  sleep 3
done
echo "Still sending in the background: $last. Run the same command again to see the progress."
`;
}

if (import.meta.main) {
  const { createCipheriv, generateKeyPairSync: pair } = await import("node:crypto");
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const assert = (ok: unknown, what: string) => {
    if (!ok) throw new Error(`FAIL: ${what}`);
    console.log(`ok: ${what}`);
  };
  const dir = mkdtempSync(join(tmpdir(), "yonder-upload-"));
  const finished: string[] = [];
  const ups = startUploads(join(dir, "uploads.json"), {
    max: 50_000_000,
    place: (_u, name) => join(dir, `got-${name}`),
    finish: async (u) => (finished.push(u.file), { path: u.file }),
  });
  const { token } = ups.create("w1", "Edit it");
  let base = "";
  const server = Bun.serve({ port: 0, fetch: (req): Promise<Response> => ups.handle(req, new URL(req.url).pathname.slice("/upload/".length), base) });
  base = `http://127.0.0.1:${server.port}/upload/${token}`;
  try {
    const sh = await (await fetch(`${base}/send.sh`)).text();
    assert(sh.includes(base) && sh.includes("BEGIN PUBLIC KEY"), "send.sh has the link and the key of the upload");
    assert((await fetch(`http://127.0.0.1:${server.port}/upload/nope`)).status === 404, "a wrong token is a 404");
    const source = join(dir, "clip.mov");
    const data = randomBytes(PART * 2 + 12345);
    writeFileSync(source, data);
    // Part 1 from another client with its own key, as a first run that stopped. The script then sends only 0 and 2.
    const me = pair("x25519");
    const mac = createPublicKey(sh.slice(sh.indexOf("-----BEGIN"), sh.indexOf("-----END PUBLIC KEY-----") + 24));
    const key = createHash("sha256").update(diffieHellman({ privateKey: me.privateKey, publicKey: mac })).digest();
    const cipher = createCipheriv("aes-256-ctr", key, ivAt(PART));
    const sealed = Buffer.concat([cipher.update(data.subarray(PART, PART * 2)), cipher.final()]);
    const put = await fetch(`${base}?name=clip.mov`, {
      method: "PUT",
      headers: { "content-range": `bytes ${PART}-${PART * 2 - 1}/${data.length}`, "x-key": me.publicKey.export({ type: "spki", format: "der" }).toString("base64") },
      body: sealed.toString("base64"),
    });
    assert(put.ok, `a part from TypeScript opens on the Mac (${put.status})`);
    assert((await (await fetch(`${base}?missing=${data.length}`)).text()) === "0\n2\n", "the link names the missing parts");
    assert((await fetch(`${base}?done`, { method: "POST" })).status === 409, "done waits for the missing parts");
    // Async, because the server of this check runs in the same process.
    const run = Bun.spawn(["bash", "-c", `curl -fsS ${base}/send.sh | bash -s -- ${source}`], { stdout: "pipe", stderr: "pipe" });
    const [code, out, err] = await Promise.all([run.exited, new Response(run.stdout).text(), new Response(run.stderr).text()]);
    assert(code === 0 && finished.length === 1, `send.sh sends the rest and ends the upload: ${out.trim()} ${err.slice(0, 300)}`);
    assert(Buffer.compare(data, readFileSync(finished[0])) === 0, "the file on the Mac is the same as the source");
    assert((await (await fetch(base, { method: "PUT", body: "" })).json()).path === finished[0], "the link is used: a new part gets the result, not a write");
  } finally {
    server.stop(true);
    rmSync(dir, { recursive: true, force: true });
  }
}
