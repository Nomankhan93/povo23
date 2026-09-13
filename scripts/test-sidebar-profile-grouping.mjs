import assert from "node:assert/strict";
import fs from "node:fs";

const src = fs.readFileSync(new URL("../src/app/AppShell.tsx", import.meta.url), "utf8");
const profile = src.indexOf('["My profile", UserRound]');
const exp = src.indexOf('["Work experience", Users]');
const docs = src.indexOf('["Private documents", ShieldCheck]');
const partner = src.indexOf('["Partner NGOs", Building2]');
assert(profile >= 0 && exp > profile && docs > exp && partner > docs,
  "Expected sidebar order: My profile -> Work experience -> Private documents -> Partner NGOs");
console.log("PASS volunteer sidebar groups Work experience and Private documents directly below My profile");
