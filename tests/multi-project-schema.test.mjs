import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const migrationUrl = new URL("../worker/migrations/0002_multi_project_foundation.sql", import.meta.url);

test("multi-project migration defines project-scoped access and research metadata", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  for (const table of [
    "research_projects",
    "project_researchers",
    "project_sample_tags",
    "submission_tags",
    "project_star_definitions",
    "submission_stars",
    "project_research_notes",
    "project_note_revisions"
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(sql, /UNIQUE \(project_id, label\)/);
  assert.match(sql, /UNIQUE \(project_id, color_key\)/);
  assert.match(sql, /revision INTEGER NOT NULL DEFAULT 1/);
  assert.doesNotMatch(sql, /多重偏誤/);
});

test("unmarked remains a derived filter instead of a stored sample tag", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(sql, /未標記/);
  assert.doesNotMatch(sql, /unmarked/i);
});

test("researcher mock page exposes the confirmed project workflows", async () => {
  const html = await readFile(new URL("../public/admin/project-mock.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/admin/project-mock.js", import.meta.url), "utf8");

  assert.match(html, /專案編輯/);
  assert.match(html, /研究人員筆記/);
  assert.match(html, /垃圾桶/);
  assert.match(html, /預計 30 天內釋放/);
  assert.match(html, /模擬資料，非即時帳務/);
  assert.match(script, /tag\.label=input\.value/);
  assert.match(script, /setTimeout\(\(\)=>\{state\.textContent="所有變更已儲存/);
  assert.doesNotMatch(html, /多重偏誤/);
});

