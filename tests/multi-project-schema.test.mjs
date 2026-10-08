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
  assert.match(html, /通過檢查並發布/);
  assert.match(html, /研究規範與同意/);
  assert.match(html, /發布前檢查/);
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
  assert.match(script, /function renderTaskEditor/);
  assert.match(script, /在受試者端啟用/);
  assert.match(script, /啟用中/);
  assert.match(script, /已停用/);
  assert.match(html, /新增星號標籤/);
  assert.match(script, /function removeTag/);
  assert.match(script, /function removeStar/);
  assert.match(script, /type="color"/);
  assert.match(script, /專案擁有者顯示名稱已在系統同步/);
  assert.match(script, /移除題目/);
  assert.match(script, /刪除目前自訂頁面/);
  assert.match(script, /自訂頁面已刪除/);
  assert.match(script, /function publishAudit/);
  assert.match(script, /完全匿名\|保證匿名/);
  assert.match(script, /研究事後說明/);
  assert.match(script, /事後說明完整內容/);
  assert.match(script, /debriefing-content/);
  assert.match(script, /project\(\)\.governance\.debriefing = event\.target\.value/);
  assert.match(script, /右側預覽及完整受試者預覽使用同一版本/);
  assert.doesNotMatch(script, /tag\.active = !tag\.active/);
  assert.doesNotMatch(script, /star\.active = !star\.active/);
  assert.match(designSql, /completion_download/);
  assert.match(capacitySql, /project_media_assets/);
  assert.match(capacitySql, /video\/mp4/);
});

test("full participant preview mirrors the configured research flow without collecting data", async () => {
  const html = await readFile(new URL("../public/admin/project-participant-preview.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/admin/project-participant-preview.js", import.meta.url), "utf8");

  assert.match(html, /研究者預覽/);
  assert.match(html, /此頁不會錄音、上傳或建立研究樣本/);
  assert.match(html, /語言 Language/);
  assert.match(html, /去識別化語音語言研究平台/);
  assert.match(html, /語音去識別化收錄網站/);
  assert.match(script, /governanceCards/);
  assert.match(script, /legacyFooter/);
  assert.match(script, /研究事後說明/);
  assert.match(script, /降低辨識風險，不保證完全匿名/);
  assert.match(script, /consent-check/);
  assert.match(script, /next\.disabled = !consentCheck\.checked/);
  assert.doesNotMatch(script, /getUserMedia/);
  assert.doesNotMatch(script, /fetch\(/);
});

test("researcher and participant ports use fixed product branding and an interactive consent preview", async () => {
  const html = await readFile(new URL("../public/admin/project-mock.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/admin/project-mock.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../public/admin/project-mock.css", import.meta.url), "utf8");

  assert.match(html, /去識別化語音語言研究平台/);
  assert.match(html, /研究人員介面/);
  assert.match(script, /class="preview-consent"/);
  assert.doesNotMatch(script, /class="preview-consent"><input disabled/);
  assert.match(css, /\.preview-consent input/);
  assert.match(css, /width:18px!important/);
});

test("sample assignments use the protected signed-in owner instead of a hard-coded researcher name", async () => {
  const html = await readFile(new URL("../public/admin/project-mock.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../public/admin/project-mock.js", import.meta.url), "utf8");

  assert.match(html, /id="current-account-name"/);
  assert.match(script, /currentResearcherMember/);
  assert.match(script, /currentResearcherName/);
  assert.match(script, /repairLegacyCurrentResearcherAssignments/);
  assert.match(script, /已指派給 \$\{researcher\}/);
  assert.doesNotMatch(script, /const currentResearcher = "王研究員"/);
});

test("research governance and consent publications are project-scoped and versioned", async () => {
  const sql = await readFile(new URL("../worker/migrations/0005_research_governance_and_consent.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_research_governance/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_publication_snapshots/);
  assert.match(sql, /consent_version TEXT NOT NULL/);
  assert.match(sql, /UNIQUE \(project_id, version\)/);
  assert.match(sql, /minimum_age INTEGER NOT NULL DEFAULT 18/);
  assert.match(sql, /collect_nationality INTEGER NOT NULL DEFAULT 0/);
});

