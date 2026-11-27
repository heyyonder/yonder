// Push notifications to the paired phones through APNs, the push service of Apple. See "Push" in docs/wiki.md.
// The key is ~/.config/yonder/AuthKey_<key id>.p8 from the Apple Developer site. Without it, nothing is sent.
// The fetch of Bun has no HTTP/2, and APNs needs it, so this uses node:http2.
import { readdirSync, readFileSync } from "node:fs";
import { connect, type SecureClientSessionOptions } from "node:http2";
import { join } from "node:path";

const TOPIC = "com.vladartym.yonder"; // The bundle ID of the phone app.
const HOSTS = ["https://api.push.apple.com", "https://api.sandbox.push.apple.com"];
const b64url = (b: ArrayBuffer | Uint8Array | string) => Buffer.from(typeof b === "string" ? b : new Uint8Array(b)).toString("base64url");

export function apns(dir: string, team: string) {
  let jwt = { token: "", at: 0 };

  // Apple takes a new token at most every 20 minutes and refuses one older than 1 hour.
  async function token() {
    if (Date.now() - jwt.at < 30 * 60_000) return jwt.token;
    const file = readdirSync(dir).find((f) => /^AuthKey_\w+\.p8$/.test(f));
    if (!file) return "";
    const pem = readFileSync(join(dir, file), "utf8").replace(/-----[^-]+-----|\s/g, "");
    const key = await crypto.subtle.importKey("pkcs8", Buffer.from(pem, "base64"), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
    const iat = Math.floor(Date.now() / 1000);
    const body = `${b64url(JSON.stringify({ alg: "ES256", kid: file.slice(8, -3) }))}.${b64url(JSON.stringify({ iss: team, iat }))}`;
    // WebCrypto gives the raw r||s signature, which is the form that ES256 needs.
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(body));
    jwt = { token: `${body}.${b64url(sig)}`, at: Date.now() };
    return jwt.token;
  }

  function post(host: string, device: string, auth: string, payload: string) {
    return new Promise<{ status: number; reason: string }>((resolve, reject) => {
      // Bun 1.3 loses the h2 of ALPN on a connect to both IPv4 and IPv6, about 1 time in 3, with the error "h2 is not
      // supported". One family has no such error.
      const client = connect(host, { family: 4 } as SecureClientSessionOptions); // The types miss family, which goes to net.connect.
      client.on("error", reject);
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${device}`,
        authorization: `bearer ${auth}`,
        "apns-topic": TOPIC,
        "apns-push-type": "alert",
      });
      let status = 0;
      let data = "";
      req.on("response", (h) => (status = Number(h[":status"])));
      req.on("data", (d) => (data += d));
      req.on("end", () => {
        client.close();
        resolve({ status, reason: status === 200 ? "" : (JSON.parse(data || "{}").reason ?? data) });
      });
      req.on("error", reject);
      req.end(payload);
    });
  }

  return {
    // Sends one alert to one device. A debug build of the app has a token of the sandbox, and a TestFlight
    // build has a token of production, so a "BadDeviceToken" from production tries the sandbox.
    // Returns true when APNs took the push, false when the token is dead, so that the caller forgets it, and undefined
    // when nothing went, for example with no key.
    async send(device: string, title: string, body: string) {
      const auth = await token();
      if (!auth) return undefined;
      const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default" } });
      for (const host of HOSTS) {
        const { status, reason } = await post(host, device, auth, payload);
        if (status === 200) return true;
        if (reason === "BadDeviceToken" && host === HOSTS[0]) continue;
        console.error(`Yonder push: ${status} ${reason}`);
        return status === 410 || reason === "BadDeviceToken" ? false : undefined;
      }
      return undefined;
    },
  };
}
