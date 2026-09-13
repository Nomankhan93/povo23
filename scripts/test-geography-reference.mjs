import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { schemaDb } from "./schema-test-db.mjs";

const db = await schemaDb("20260921000100_phase27_workforce_marketplace.sql");
let passed = 0;
async function ok(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
const rows = async (q, p = []) => (await db.query(q, p)).rows;
try {
  await db.exec(readFileSync("supabase/migrations/20260922000100_pakistan_geography_reference.sql", "utf8"));

  await ok("reference migration seeds exactly seven Province/Territory roots", async () => {
    const r = await rows("select name from public.geographies where parent_id is null and code like 'PKREF-%' order by code");
    assert.equal(r.length, 7);
    const names = new Set(r.map((x) => x.name));
    for (const name of [
      "Sindh",
      "Punjab",
      "Khyber Pakhtunkhwa (KP)",
      "Balochistan",
      "Islamabad Capital Territory",
      "Azad Jammu & Kashmir (AJK)",
      "Gilgit-Baltistan (GB)",
    ]) assert(names.has(name), `Missing ${name}`);
  });

  await ok("province/territory reference counts match supplied hierarchy", async () => {
    const expected = {
      "PKREF-SD": [6, 30, 138],
      "PKREF-PB": [10, 41, 156],
      "PKREF-KP": [7, 37, 156],
      "PKREF-BA": [11, 41, 141],
      "PKREF-ICT": [0, 1, 1],
      "PKREF-AJK": [3, 10, 32],
      "PKREF-GB": [3, 10, 34],
    };
    for (const [code, want] of Object.entries(expected)) {
      const root = (await rows("select id from public.geographies where code=$1", [code]))[0];
      assert(root, `Missing ${code}`);
      const counts = await rows(`with recursive tree as (
        select id,parent_id,kind from public.geographies where id=$1
        union all select g.id,g.parent_id,g.kind from public.geographies g join tree t on g.parent_id=t.id
      ) select count(*) filter(where kind='division')::int divisions,
               count(*) filter(where kind='district')::int districts,
               count(*) filter(where kind='taluka')::int talukas from tree`, [root.id]);
      assert.deepEqual([counts[0].divisions, counts[0].districts, counts[0].talukas], want, code);
    }
  });

  await ok("ICT skips division and links Islamabad District directly to territory", async () => {
    const r = await rows(`select d.name district,p.name parent,p.kind parent_kind
      from public.geographies d join public.geographies p on p.id=d.parent_id
      where d.code='PKREF-ICT-DS01'`);
    assert.deepEqual(r[0], { district: "Islamabad District", parent: "Islamabad Capital Territory", parent_kind: "province" });
  });

  await ok("known supplied chains resolve to related divisions, districts and talukas", async () => {
    const checks = [
      ["Sindh", "Mirpur Khas Division", "Umerkot", "Kunri"],
      ["Punjab", "Lahore Division", "Lahore", "Raiwind"],
      ["Khyber Pakhtunkhwa (KP)", "Malakand Division", "Bar Swat", "Bahrain"],
      ["Balochistan", "Makuran Division", "Gwadar", "Pasni"],
      ["Azad Jammu & Kashmir (AJK)", "Poonch Division", "Poonch", "Rawalakot"],
      ["Gilgit-Baltistan (GB)", "Baltistan Division", "Skardu", "Roundu"],
    ];
    for (const [province, division, district, taluka] of checks) {
      const r = await rows(`select t.name taluka,d.name district,v.name division,p.name province
        from public.geographies t
        join public.geographies d on d.id=t.parent_id
        join public.geographies v on v.id=d.parent_id
        join public.geographies p on p.id=v.parent_id
        where p.name=$1 and v.name=$2 and d.name=$3 and t.name=$4 and t.code like 'PKREF-%'`, [province, division, district, taluka]);
      assert.equal(r.length, 1, `${province} / ${division} / ${district} / ${taluka}`);
    }
  });

  await ok("profile RPC requires taluka/tehsil and full address while UC remains optional", async () => {
    const migration = readFileSync("supabase/migrations/20260922000100_pakistan_geography_reference.sql", "utf8");
    assert.match(migration, /Full address is required/);
    assert.match(migration, /Select a Taluka \/ Tehsil before submitting/);
    assert.match(migration, /union_council/);
    assert.doesNotMatch(migration, /Union Council is required/);
  });

  await ok("volunteer picker hides synthetic fixtures and supports ICT division skip", async () => {
    const picker = readFileSync("src/features/geography/GeographyPicker.tsx", "utf8");
    const profile = readFileSync("src/features/volunteers/ProfileForm.tsx", "utf8");
    assert.match(picker, /Province \/ Territory/);
    assert.match(picker, /divisions\.length \? selectedDivision : selectedProvince/);
    assert.match(picker, /isSynthetic/);
    assert.match(profile, /Union Council \(optional\)/);
    assert.match(profile, /Full address/);
  });

  console.log(`\n${passed} Pakistan geography reference tests passed.`);
} finally {
  await db.close();
}
