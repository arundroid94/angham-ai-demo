const fs = require("fs");
const path = require("path");
const https = require("https");

const dir = path.join(__dirname, "..", "public", "images");
fs.mkdirSync(dir, { recursive: true });
const N = 20;

function fetchTo(url, file, redirects = 0) {
  return new Promise((resolve) => {
    https.get(url, (r) => {
      if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && redirects < 5) {
        r.resume();
        return resolve(fetchTo(r.headers.location, file, redirects + 1));
      }
      const out = fs.createWriteStream(file);
      r.pipe(out);
      out.on("finish", () => out.close(resolve));
    }).on("error", () => resolve());
  });
}

(async () => {
  for (let i = 1; i <= N; i++) {
    await fetchTo(`https://picsum.photos/seed/angham-${i}/400/400`, path.join(dir, `cover-${i}.jpg`));
    console.log("saved cover-" + i + ".jpg");
  }
  console.log("Done.");
})();