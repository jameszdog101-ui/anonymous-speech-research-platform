const previewPayload = JSON.parse(localStorage.getItem("research-participant-preview-v1") || "null");
const previewProject = previewPayload?.project;
const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);

if (!previewProject) {
  document.body.innerHTML = '<main style="max-width:680px;margin:80px auto;font-family:sans-serif"><h1>沒有可預覽的專案</h1><p>請回到研究者端的「專案設計」，按下「開啟完整受試者預覽」。</p></main>';
  throw new Error("Missing participant preview configuration");
}

const governance = previewProject.governance || {};
const pages = previewProject.pages || [];
let pageIndex = 0;
const pageTitle = document.querySelector("#page-title");
document.title = `${governance.publicTitle || previewProject.name}｜受試者預覽`;
document.querySelector("#brand-title").textContent = governance.publicTitle || "去識別化語音研究";
document.querySelector("#footer-text").textContent = previewProject.footer || "研究資料僅依知情同意與核准計畫使用。";

function options(block) { return String(block.options || "").split("\n").map(value => value.trim()).filter(Boolean); }
function governanceCards() {
  return [
    ["研究機構與主持人", `${governance.institution || "尚未填寫"}｜${governance.principalInvestigator || "尚未填寫"}`],
    ["研究目的與時間", `${governance.purpose || "尚未填寫"} 預計 ${governance.participationTime || "尚未填寫"}。`],
    ["資料使用與存取", governance.dataUse || "尚未填寫"],
    ["原始錄音與去識別化", "原始錄音只在裝置內處理；上傳的是轉換後音檔。聲音處理用於降低辨識風險，不保證完全匿名。"],
    ["保存與刪除", `${governance.retentionPeriod || "尚未填寫"}；${governance.retentionDisposal || "尚未填寫"}`],
    ["自願參與與撤回", governance.withdrawalPolicy || "尚未填寫"],
    ["可能風險", governance.risks || "尚未填寫"],
    ["可能利益", governance.benefits || "尚未填寫"],
    ["研究聯絡方式", governance.contactEmail || "尚未填寫"],
    ["倫理審查", governance.ethicsStatus === "approved" ? `已核准｜${governance.ethicsReference || "案號尚未填寫"}` : governance.ethicsStatus === "reviewing" ? "審查中，不宣稱已通過研究倫理審查" : "尚未送審，不宣稱已通過研究倫理審查"]
  ].map(([title, text]) => `<article><strong>${escapeHtml(title)}</strong><p>${escapeHtml(text)}</p></article>`).join("");
}
function renderBlock(block) {
  const required = block.required ? "（必填）" : "";
  const note = block.note ? `<small>${escapeHtml(block.note)}</small>` : "";
  if (block.type === "notice") return `<section class="block notice">${escapeHtml(block.label)}</section>`;
  if (block.type === "heading") return `<section class="block"><h2>${escapeHtml(block.label)}</h2>${note}</section>`;
  if (block.type === "paragraph") return `<section class="block"><p>${escapeHtml(block.label)}</p>${note}</section>`;
  if (block.type === "divider") return "<hr>";
  if (block.type === "consent") return `<section class="block consent"><label><input class="consent-check" type="checkbox"> <span>${escapeHtml(block.label)} ${required}<small>同意版本：${escapeHtml(governance.consentVersion || "尚未填寫")}</small></span></label></section>`;
  if (block.type === "debriefing") return `<section class="block debrief"><strong>研究事後說明</strong><p>${escapeHtml(governance.debriefing || "尚未填寫")}</p></section>`;
  if (["device_audio", "speech_task"].includes(block.type)) return `<section class="block media-card"><strong>${escapeHtml(block.label)} ${required}</strong>${note}${/\.mp4$/i.test(block.fileName || "") ? `<video controls src="${escapeHtml(block.src || "")}"></video>` : `<audio controls src="${escapeHtml(block.src || "")}"></audio>`}<small>${escapeHtml(block.fileName || "尚未上傳題目媒體")}</small><div class="record-simulation"><button type="button" title="模擬錄音">●</button><span>預覽模式不會啟用麥克風或上傳資料</span></div></section>`;
  if (block.type === "completion_download") return `<section class="block"><button class="completion-button" type="button">${escapeHtml(block.label)}</button><small>完成證明不包含研究編號、時間、處理設定或回答資料。</small></section>`;
  if (block.type === "repeatable_text") return `<section class="block"><label>${escapeHtml(block.label)} ${required}<input type="text" placeholder="受試者填寫"></label>${note}<button type="button">＋ 新增另一個語言</button></section>`;
  if (block.type === "select_field") return `<section class="block"><label>${escapeHtml(block.label)} ${required}<select><option>請選擇</option>${options(block).map(option => `<option>${escapeHtml(option)}</option>`).join("")}</select></label>${note}</section>`;
  if (["single_choice", "multiple_choice"].includes(block.type)) return `<fieldset class="block choices"><legend>${escapeHtml(block.label)} ${required}</legend>${note}${options(block).map(option => `<label><input name="field-${escapeHtml(block.id)}" type="${block.type === "single_choice" ? "radio" : "checkbox"}"> ${escapeHtml(option)}</label>`).join("")}</fieldset>`;
  return `<section class="block"><label>${escapeHtml(block.label)} ${required}<input type="${block.type === "number_field" ? "number" : "text"}" placeholder="受試者填寫"></label>${note}</section>`;
}
function render() {
  const page = pages[pageIndex];
  document.querySelector("#progress-list").innerHTML = pages.map((item, index) => `<li class="${index < pageIndex ? "done" : index === pageIndex ? "active" : ""}" data-number="${index + 1}">${escapeHtml(item.label)}</li>`).join("");
  document.querySelector("#page-kicker").textContent = page.label;
  pageTitle.textContent = page.title;
  document.querySelector("#page-body").textContent = page.body;
  const consent = page.key === "consent";
  document.querySelector("#governance-summary").hidden = !consent;
  document.querySelector("#governance-summary").innerHTML = consent ? governanceCards() : "";
  document.querySelector("#page-blocks").innerHTML = (page.blocks || []).map(renderBlock).join("");
  document.querySelector("#previous-page").disabled = pageIndex === 0;
  const next = document.querySelector("#next-page");
  next.textContent = pageIndex === pages.length - 1 ? "結束預覽" : "下一步";
  const consentCheck = document.querySelector(".consent-check");
  if (consentCheck) { next.disabled = true; consentCheck.onchange = () => { next.disabled = !consentCheck.checked; }; }
  else next.disabled = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelector("#previous-page").onclick = () => { pageIndex = Math.max(0, pageIndex - 1); render(); };
document.querySelector("#next-page").onclick = () => { if (pageIndex === pages.length - 1) { window.close(); return; } pageIndex += 1; render(); };
document.querySelector("#close-preview").onclick = () => window.close();
render();
