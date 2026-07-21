import fs from "fs";
import path from "path";

const root = "C:/Users/Michael/WorkBuddy/2026-07-16-10-54-35/TrueLens";

// 1) flatten a JSON object into dotted keys
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = true;
  }
  return out;
}

const zh = flatten(JSON.parse(fs.readFileSync(path.join(root, "messages/zh.json"), "utf8")));
const en = flatten(JSON.parse(fs.readFileSync(path.join(root, "messages/en.json"), "utf8")));

// 2) extract t("key") / t('key') / t(`key`) and serverT(locale, "key") usages
const used = new Set();
const dirs = ["app", "components", "lib"];
const exts = [".ts", ".tsx"];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".next", ".git"].includes(e.name)) continue;
      walk(p);
    } else if (exts.includes(path.extname(e.name))) {
      const src = fs.readFileSync(p, "utf8");
      const re = /(?:^|[^a-zA-Z])t\(\s*([`'"])([^`'"]+)\1\s*\)|serverT\(\s*\w+\s*,\s*([`'"])([^`'"]+)\3\s*\)/g;
      let m;
      while ((m = re.exec(src))) {
        const key = m[2] || m[4];
        if (key) used.add(key);
      }
    }
  }
}
for (const d of dirs) walk(path.join(root, d));

// 3) report
const missingZh = [...used].filter((k) => !zh[k]);
const missingEn = [...used].filter((k) => !en[k]);
const onlyZh = Object.keys(zh).filter((k) => !en[k]);
const onlyEn = Object.keys(en).filter((k) => !zh[k]);

console.log(`Used keys in code: ${used.size}`);
console.log(`Missing in zh.json: ${missingZh.length ? missingZh.join(", ") : "none"}`);
console.log(`Missing in en.json: ${missingEn.length ? missingEn.join(", ") : "none"}`);
console.log(`In zh but not en: ${onlyZh.length ? onlyZh.join(", ") : "none"}`);
console.log(`In en but not zh: ${onlyEn.length ? onlyEn.join(", ") : "none"}`);
