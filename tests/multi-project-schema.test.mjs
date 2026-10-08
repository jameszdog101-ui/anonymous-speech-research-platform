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

  assert.match(html, /data-view="home">首頁/);
  assert.match(html, /data-view="projects">研究專案/);
  assert.match(html, /data-view="capacity">專案容量管理/);
  assert.match(html, /data-view="create">新增研究專案/);
  assert.match(html, /data-view="trash">垃圾桶/);
  assert.match(html, /data-project-view="notes">研究筆記/);
  assert.match(html, /data-project-view="members">研究人員/);
  assert.match(html, /專案協作/);
  assert.match(html, /垃圾桶/);
  assert.match(script, /預計 30 天內釋放/);
  assert.match(html, /容量口徑/);
  assert.match(script, /標籤名稱已全面同步/);
  assert.match(script, /所有變更已儲存/);
  assert.match(script, /研究化名/);
  assert.match(script, /出現位置或判定原因/);
  assert.match(script, /audio controls/);
  assert.match(html, /該專案彩色星號的標籤/);
  assert.match(html, /使用者名稱/);
  assert.match(script, /pageSize = 10/);
  assert.match(script, /負責研究人員/);
  assert.match(script, /正在分析/);
  assert.match(script, /完成分析/);
  assert.match(script, /增加註解/);
  assert.match(script, /直接修改/);
  assert.match(script, /inline-detail/);
  assert.match(script, /label: "報告用"/);
  assert.match(html, /project-design-form/);
  assert.match(html, /受試者端專屬 URL/);
  assert.match(html, /發布更新/);
  assert.doesNotMatch(html, /多重偏誤/);
});

test("capacity and trash mock expose synchronized bulk workflows", async () => {
  const html = await readFile(new URL("../public/admin/project-mock.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/admin/project-mock.js", import.meta.url), "utf8");
  assert.match(html, /全選目前篩選結果/);
  assert.match(html, /還原所選/);
  assert.match(html, /永久刪除所選/);
  assert.match(script, /state\.trashSelected\.add/);
  assert.match(script, /state\.trashSelected\.delete/);
  assert.match(script, /moveProjectAudioToTrash/);
  assert.match(script, /moveProjectToTrash/);
  assert.match(script, /研究員名稱與權限已全面同步/);
});

test("project designer preserves the complete participant form surface", async () => {
  const html = await readFile(new URL("../public/admin/project-mock.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/admin/project-mock.js", import.meta.url), "utf8");
  const designSql = await readFile(new URL("../worker/migrations/0003_project_permissions_and_design.sql", import.meta.url), "utf8");
  const capacitySql = await readFile(new URL("../worker/migrations/0004_project_capacity_and_trash.sql", import.meta.url), "utf8");

  assert.match(html, /語言選擇/);
  assert.match(html, /建立草稿並進入完整設計器/);
  assert.match(script, /device_audio/);
  assert.match(script, /speech_task/);
  assert.match(script, /completion_download/);
  assert.match(script, /\.mp4,\.wav/);
  assert.match(script, /單一題目媒體不可超過 50 MB/);
  assert.match(script, /欄位已複製/);
  assert.match(script, /欄位已從草稿移除/);
  assert.match(script, /去識別化語音預聽/);
  assert.match(designSql, /completion_download/);
  assert.match(capacitySql, /project_media_assets/);
  assert.match(capacitySql, /video\/mp4/);
});

