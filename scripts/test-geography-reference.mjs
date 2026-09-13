import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { schemaDb } from "./schema-test-db.mjs";

const db = await schemaDb("20260922000200_geography_regression_stabilization.sql");
let passed = 0;
const ids = {
  super: "97000000-0000-4000-8000-000000000001",
  volunteer: "97000000-0000-4000-8000-000000000002",
  volunteerUc: "97000000-0000-4000-8000-000000000003",
};

async function ok(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
const rows = async (q, p = []) => (await db.query(q, p)).rows;
async function as(name) {
  await db.exec("RESET ROLE");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[name] || ""]);
  await db.exec(`SET ROLE ${name ? "authenticated" : "anon"}`);
}
async function call(name, args) {
  return (await rows(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) result`, args))[0].result;
}
const denied = (fn, re) => assert.rejects(fn, re);

try {
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

  for (const [name, id] of Object.entries(ids)) {
    await db.query("insert into auth.users(id,email) values($1,$2)", [id, `${name}@geography.test`]);
  }
  await db.query("update public.accounts set platform_role='super_admin' where id=$1", [ids.super]);

  await ok("new non-ICT districts require a Division while ICT may skip it", async () => {
    await as("super");
    const province = await call("save_geography", [null, null, "province", "Runtime Province", "G272-P", "2.7.2 regression fixture", true]);
    await denied(
      () => call("save_geography", [null, province, "district", "Invalid Direct District", "G272-BAD", "2.7.2 regression fixture", true]),
      /Invalid parent level/
    );
    const division = await call("save_geography", [null, province, "division", "Runtime Division", "G272-D", "2.7.2 regression fixture", true]);
    const district = await call("save_geography", [null, division, "district", "Runtime District", "G272-DS", "2.7.2 regression fixture", true]);
    assert(district);

    const ict = (await rows("select id from public.geographies where code='PKREF-ICT'"))[0];
    assert(ict);
    const directIct = await call("save_geography", [null, ict.id, "district", "Runtime ICT District", "G272-ICT-DS", "2.7.2 regression fixture", true]);
    assert(directIct);
  });

  await ok("profile submission enforces full address and Taluka/Tehsil at runtime", async () => {
    const district = (await rows("select id from public.geographies where code='PKREF-SD-D05-DS03'"))[0];
    const taluka = (await rows("select id from public.geographies where code='PKREF-SD-D05-DS03-T02'"))[0];
    assert(district && taluka);

    await as("volunteer");
    await denied(
      () => call("save_my_profile", [{ full_name: "Runtime Volunteer", phone: "03000000000" }, true, 1, taluka.id]),
      /Full address is required/
    );
    await denied(
      () => call("save_my_profile", [{ full_name: "Runtime Volunteer", phone: "03000000000", address: "House 1, Kunri" }, true, 1, district.id]),
      /Select a Taluka \/ Tehsil/
    );
    await call("save_my_profile", [{ full_name: "Runtime Volunteer", phone: "03000000000", address: "House 1, Kunri" }, true, 1, taluka.id]);
    const profile = (await rows("select details,geography_id from public.volunteer_profiles where user_id=$1", [ids.volunteer]))[0];
    assert.equal(profile.geography_id, taluka.id);
    assert.equal(profile.details.address, "House 1, Kunri");
    assert.equal(profile.details.area, "House 1, Kunri");
    assert.equal(profile.details.union_council, "");
  });

  await ok("Union Council remains optional but persists when supplied", async () => {
    const taluka = (await rows("select id from public.geographies where code='PKREF-SD-D05-DS03-T02'"))[0];
    await as("volunteerUc");
    await call("save_my_profile", [{
      full_name: "Runtime UC Volunteer",
      phone: "03000000001",
      address: "House 2, Kunri",
      union_council: "UC Test",
    }, true, 1, taluka.id]);
    const profile = (await rows("select details from public.volunteer_profiles where user_id=$1", [ids.volunteerUc]))[0];
    assert.equal(profile.details.union_council, "UC Test");
  });

  await ok("profile RPC contract and volunteer picker retain required UI behavior", async () => {
    const migration = readFileSync("supabase/migrations/20260922000100_pakistan_geography_reference.sql", "utf8");
    const picker = readFileSync("src/features/geography/GeographyPicker.tsx", "utf8");
    const profile = readFileSync("src/features/volunteers/ProfileForm.tsx", "utf8");
    assert.match(migration, /Full address is required/);
    assert.match(migration, /union_council/);
    assert.doesNotMatch(migration, /Union Council is required/);
    assert.match(picker, /Province \/ Territory/);
    assert.match(picker, /divisions\.length \? selectedDivision : selectedProvince/);
    assert.match(picker, /isSynthetic/);
    assert.match(profile, /Union Council \(optional\)/);
    assert.match(profile, /Full address/);
  });

  console.log(`\n${passed} Pakistan geography reference/stabilization tests passed.`);
} finally {
  await db.close();
}
