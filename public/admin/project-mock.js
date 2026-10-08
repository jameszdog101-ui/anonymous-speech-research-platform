const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const GB = 1024 ** 3;
const MB = 1024 ** 2;
const FREE_R2_BYTES = 10 * GB;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const ALLOWED_MEDIA_EXTENSIONS = [".mp4", ".wav"];
const currentResearcher = "王研究員";
const pageSize = 10;

const statusLabels = { collecting: "收件中", closed: "已關閉", draft: "草稿", archived: "已封存" };
const permissionGroups = {
  "專案與發布": [
    ["project_edit_basic", "編輯專案基本資料"], ["project_open_close", "變更專案狀態"],
    ["participant_content_edit", "編輯受試者頁面"], ["participant_publish", "發布受試者頁面"],
    ["task_edit", "編輯題目"], ["task_audio_upload", "上傳問題音檔"]
  ],
  "樣本與分析": [
    ["sample_view_all", "查看全部樣本"], ["sample_assign_self", "指派自己負責"],
    ["sample_assign_others", "指派其他研究員"], ["sample_edit_analysis", "編輯樣本分析"],
    ["sample_complete_analysis", "完成／重開分析"], ["sample_comment", "增加註解"],
    ["sample_alias_edit", "編輯研究化名"], ["sample_star_edit", "設定星號標籤"]
  ],
  "研究設定與成員": [
    ["tag_manage", "管理分析標籤"], ["star_definition_manage", "管理彩色星號"],
    ["research_notes_edit", "編輯研究筆記"], ["member_add_researcher", "新增研究人員"],
    ["member_edit_display_name", "編輯研究員名稱"], ["member_assign_permissions", "指派管理員權限"]
  ],
  "資料與容量": [
    ["audio_play", "播放去識別化音檔"], ["audio_download", "下載音檔"],
    ["metadata_export", "匯出研究資料"], ["capacity_view_account", "查看帳戶容量"],
    ["capacity_limit_manage", "管理容量上限"], ["trash_restore", "還原垃圾桶項目"]
  ]
};
const allPermissions = Object.values(permissionGroups).flat().map(([key]) => key);
const researcherDefaults = ["sample_view_all", "sample_assign_self", "sample_edit_analysis", "sample_complete_analysis", "sample_comment", "sample_alias_edit", "sample_star_edit", "audio_play"];

const defaultPages = () => [
  { key: "language", label: "語言選擇", title: "選擇平台語言", body: "選擇閱讀研究平台時使用的語言。", blocks: [{ id: crypto.randomUUID(), type: "select_field", label: "平台語言", options: "繁體中文\n简体中文\nEnglish\n日本語\n한국어\nTiếng Việt" }] },
  { key: "start", label: "研究說明", title: "語音感知與產出研究", body: "本測試將請你聆聽短音檔並錄下口語回應。", blocks: [{ id: crypto.randomUUID(), type: "notice", label: "匿名參與：不詢問可直接識別身分的資料。" }, { id: crypto.randomUUID(), type: "notice", label: "裝置內轉換：原始錄音不會離開你的裝置。" }] },
  { key: "consent", label: "同意書", title: "研究參與同意", body: "確認同意後才能繼續。", blocks: [{ id: crypto.randomUUID(), type: "single_choice", label: "我已閱讀上述說明，並同意參與。", required: true }] },
  { key: "background", label: "背景資料", title: "語言使用概況", body: "以下資料僅供分組分析，請勿填入可辨識個人身分的內容。", blocks: [{ id: crypto.randomUUID(), type: "select_field", label: "年齡區間", options: "未滿 18 歲\n18–24 歲\n25–34 歲\n35–44 歲\n45–54 歲\n55 歲以上", required: true }, { id: crypto.randomUUID(), type: "select_field", label: "生理性別", options: "生理男\n生理女", required: true }, { id: crypto.randomUUID(), type: "text_field", label: "國籍", note: "例如：日本", required: true }, { id: crypto.randomUUID(), type: "text_field", label: "第一語言", note: "例如：日文", required: true }, { id: crypto.randomUUID(), type: "notice", label: "第二語言固定為中文（普通話）。" }, { id: crypto.randomUUID(), type: "number_field", label: "華語／漢語／中文／普通話學習時間（年）", note: "例如：1.5", required: true }, { id: crypto.randomUUID(), type: "repeatable_text", label: "其他會使用的語言（選填）" }] },
  { key: "device", label: "設備測試", title: "設備與資格確認", body: "請先確認喇叭與麥克風可以正常使用。", blocks: [{ id: crypto.randomUUID(), type: "notice", label: "你的聲音會先去識別化，回放不像自己的聲音是正常現象。" }, { id: crypto.randomUUID(), type: "device_audio", label: "測試聲音播放", note: "按下播放後，確認能清楚聽到測試音樂。", fileName: "device-test-music.wav", src: "../assets/device-test-music.wav" }, { id: crypto.randomUUID(), type: "paragraph", label: "第一語言口說錄音：請使用母語描述今天早上、中午和晚上的天氣。" }] },
  { key: "tasks", label: "口說任務", title: "您的題目", body: "問題可播放最多 2 次，回答可錄製最多 2 次。", blocks: [{ id: crypto.randomUUID(), type: "speech_task", label: "問題一", note: "請聽完問題後，以平常說話的速度回答。", fileName: "stimulus-01.wav", src: "../assets/stimulus-01.wav" }] },
  { key: "complete", label: "完成頁", title: "謝謝你的參與", body: "資料已安全送出。", blocks: [{ id: crypto.randomUUID(), type: "notice", label: "完成證明不包含匿名編號、時間或研究資料。" }, { id: crypto.randomUUID(), type: "completion_download", label: "下載完成證明圖片" }] }
];

const projects = [
  makeProject("p1", "華語語調研究 2026", "mandarin-intonation-2026", "collecting", 1.63 * GB, 109.6 * MB, 128, 300),
  makeProject("p2", "第二語言敘事研究", "l2-narrative", "closed", 2.22 * GB, 88.9 * MB, 76, 180),
  makeProject("p3", "華語語用理解先導研究", "pragmatics-pilot", "draft", 0, 0, 0, 80)
];

function makeProject(id, name, slug, status, activeBytes, trashBytes, sampleCount, maxSubmissions) {
  return {
    id, name, slug, status, activeBytes, trashBytes, sampleCount, maxSubmissions, capacityLimit: 3 * GB,
    version: status === "draft" ? 0 : 4, publishedAt: status === "draft" ? "尚未發布" : "2026/10/7 16:42",
    footer: "本研究資料僅供學術研究使用。", pages: defaultPages(), selectedPage: "start",
    tags: [{ label: "語音偏誤", used: 34, reason: true }, { label: "句法偏誤", used: 21, reason: true }, { label: "語用偏誤", used: 12, reason: true }],
    stars: [{ color: "red", hex: "#d95c45", label: "報告用", used: 34, active: true }, { color: "gold", hex: "#b77b15", label: "典型樣本", used: 19, active: true }, { color: "blue", hex: "#3478a6", label: "討論案例", used: 11, active: true }],
    members: [
      { email: "owner@protected.invalid", displayName: "專案擁有者", owner: true, admin: true, permissions: allPermissions },
      { email: "researcher-a@example.edu", displayName: "王研究員", owner: false, admin: true, permissions: allPermissions.filter(key => !key.includes("member_assign")) },
      { email: "researcher-b@example.edu", displayName: "陳研究員", owner: false, admin: false, permissions: [...researcherDefaults] }
    ],
    notes: { division: "A 研究員：第一語言資格審核\nB 研究員：正式回答轉寫", analysis: "語用偏誤必須註明題號與出現位置。", history: ["專案擁有者 · 剛剛", "陳研究員 · 昨日 16:42"] },
    tasks: [{ id: "01", title: "問題一", instructions: "請聽完問題後，以平常說話的速度回答。", audio: "stimulus-01.wav", src: "../assets/stimulus-01.wav", published: true }, { id: "02", title: "問題二", instructions: "請完整回答題目。", audio: "stimulus-02.wav", src: "../assets/stimulus-01.wav", published: true }]
  };
}

const samples = Array.from({ length: 23 }, (_, index) => ({
  id: index === 0 ? "ac8f5580-6dc7-411c-afbb-4ff2bbb29d82" : crypto.randomUUID(), projectId: "p1",
  alias: index === 0 ? "小林 A" : `Case J-${String(index + 1).padStart(2, "0")}`,
  bytes: (17.4 + (index % 5) * 1.3) * MB, tags: index % 4 === 0 ? ["語音偏誤"] : index % 4 === 1 ? ["句法偏誤", "語用偏誤"] : [],
  reasons: {}, star: ["red", "blue", "gold", null][index % 4], eligibility: ["符合", "無法判定", "符合", "不符合"][index % 4],
  assignee: index < 2 ? "陳研究員" : null, analysisStatus: index === 1 ? "completed" : index === 0 ? "in_progress" : "unassigned",
  completedBy: index === 1 ? "陳研究員" : null, answer: "", changes: index === 1 ? ["2026.10.5 12:21 陳研究員 完成分析"] : []
}));

let trashItems = [
  trashItem("t1", "p1", "小林 B", 41.8 * MB, "2026-10-08", 24), trashItem("t2", "p1", "Case J-18", 38.2 * MB, "2026-10-08", 24),
  trashItem("t3", "p2", "Case K-17", 22.4 * MB, "2026-10-07", 28), trashItem("t4", "p2", "Case K-03", 31.1 * MB, "2026-10-07", 28),
  trashItem("t5", "p1", "Case J-09", 29.6 * MB, "2026-10-05", 21), trashItem("t6", "p2", "Case K-08", 35.4 * MB, "2026-10-05", 21)
];
function trashItem(id, projectId, alias, bytes, deletedAt, daysLeft) { return { id, projectId, alias, bytes, deletedAt, daysLeft, kind: "sample" }; }

const state = { projectId: "p1", selectedSampleId: null, selectedTaskId: null, samplePage: 1, selectedMemberEmail: null, createStep: 0, trashSelected: new Set(), capacitySyncedAt: "2026/10/8 10:15" };
const project = () => projects.find(item => item.id === state.projectId && !item.trashed) || projects.find(item => !item.trashed);
const projectById = id => projects.find(item => item.id === id);
const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const shortId = id => `${id.slice(0, 8)}…${id.slice(-4)}`;
const formatBytes = bytes => bytes >= GB ? `${(bytes / GB).toFixed(2)} GB` : `${(bytes / MB).toFixed(1)} MB`;
const pct = (value, total) => total ? `${(value / total * 100).toFixed(1)}%` : "0.0%";
const projectTotal = item => item.activeBytes + item.trashBytes;

function toast(message) { const element = $("#toast"); element.textContent = message; element.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => element.hidden = true, 2200); }
function metric(label, value, detail, tone = "") { return `<div class="metric ${tone}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`; }
function statusClass(status) { return status === "collecting" ? "" : status; }

function switchMain(name) {
  $$(".main-nav").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  $$(".view").forEach(view => view.classList.toggle("active", view.dataset.panel === name));
  if (name === "capacity") renderCapacity();
  if (name === "trash") renderTrash();
  if (name === "create") renderCreateStep();
}
function switchProjectPane(name) { $$(".project-tab").forEach(button => button.classList.toggle("active", button.dataset.projectView === name)); $$(".project-pane").forEach(pane => pane.classList.toggle("active", pane.dataset.projectPanel === name)); }

function renderProjectNavigation() {
  const available = projects.filter(item => !item.trashed);
  if (!available.some(item => item.id === state.projectId)) state.projectId = available[0]?.id;
  const select = $("#project-select"); select.replaceChildren(...available.map(item => new Option(item.name, item.id)));
  select.value = state.projectId;
  const item = project(); if (!item) return;
  $("#project-meta").innerHTML = `<span class="state ${statusClass(item.status)}">${statusLabels[item.status]}</span><span>研究者 ${item.members.length} 人</span><span>樣本 ${item.sampleCount} 份</span><span>${formatBytes(projectTotal(item))}</span>`;
}
function renderHome() {
  const activeProjects = projects.filter(item => !item.trashed); const total = activeProjects.reduce((sum, item) => sum + projectTotal(item), 0); const trash = trashItems.reduce((sum, item) => sum + item.bytes, 0);
  $("#home-capacity").innerHTML = metric("全部專案", activeProjects.length, `${activeProjects.filter(item => item.status === "collecting").length} 個收件中`) + metric("R2 目前容量", formatBytes(total), "含垃圾桶") + metric("R2 免費額度", pct(total, FREE_R2_BYTES), `尚餘 ${formatBytes(Math.max(0, FREE_R2_BYTES - total))}`) + metric("預計 30 天內釋放", formatBytes(trash), `占目前容量 ${pct(trash, total)}`, "warn");
  const root = $("#project-cards"); root.replaceChildren();
  activeProjects.forEach(item => { const card = document.createElement("article"); card.innerHTML = `<div><span class="state ${statusClass(item.status)}">${statusLabels[item.status]}</span><h3>${esc(item.name)}</h3><p>${item.members.length} 位研究人員 · ${item.sampleCount} 份樣本 · ${formatBytes(projectTotal(item))}</p></div><button>進入專案</button>`; $("button", card).onclick = () => openProject(item.id); root.append(card); });
}
function openProject(id) { state.projectId = id; state.selectedSampleId = null; state.samplePage = 1; renderProject(); switchMain("projects"); switchProjectPane("overview"); }
function renderProject() {
  renderProjectNavigation(); const item = project(); if (!item) return;
  $("#overview-name").textContent = item.name;
  $("#project-metrics").innerHTML = metric("專案樣本", item.sampleCount, `上限 ${item.maxSubmissions} 份`) + metric("專案容量", formatBytes(projectTotal(item)), `占免費額度 ${pct(projectTotal(item), FREE_R2_BYTES)}`) + metric("研究人員", item.members.length, `${item.members.filter(member => member.admin).length} 位管理者`) + metric("垃圾桶", formatBytes(item.trashBytes), `${trashItems.filter(row => row.projectId === item.id).length} 項等待清除`, "warn");
  $("#publish-summary").innerHTML = [["受試者端", statusLabels[item.status]], ["題目版本", item.version ? `第 ${item.version} 版` : "尚未發布"], ["最高收錄數量", `${item.maxSubmissions} 份`], ["最近發布", item.publishedAt]].map(([term, value]) => `<div><dt>${term}</dt><dd>${esc(value)}</dd></div>`).join("");
  renderSampleFilters(); renderSamples(); renderTagEditors(); renderTasks(); renderNotes(); renderMembers(); renderDesigner();
}

function renderSampleFilters() {
  const item = project();
  $("#assignee-filters").innerHTML = `<label><input type="checkbox" name="filter-assignee" value="unassigned">尚未負責</label>` + item.members.filter(member => !member.owner).map(member => `<label><input type="checkbox" name="filter-assignee" value="${esc(member.displayName)}">${esc(member.displayName)}</label>`).join("");
  $("#tag-filters").innerHTML = item.tags.map(tag => `<label><input type="checkbox" name="filter-tag" value="${esc(tag.label)}">${esc(tag.label)}</label>`).join("") + `<label><input type="checkbox" name="filter-tag" value="未標記">未標記</label>`;
  $("#star-filters").innerHTML = item.stars.map(star => `<label><input type="checkbox" name="filter-star" value="${star.color}"><i class="star" style="color:${starHex(star)}">★</i>${esc(star.label)}</label>`).join("");
  $$('input[type="checkbox"]', $(".filters")).forEach(input => input.onchange = () => { state.samplePage = 1; renderSamples(); });
}
function checkedValues(name) { return $$(`input[name="${name}"]:checked`).map(input => input.value); }
function filteredSamples() {
  const query = $("#sample-search").value.trim().toLowerCase(); const eligibility = checkedValues("filter-eligibility"); const progress = checkedValues("filter-progress"); const assignees = checkedValues("filter-assignee"); const tags = checkedValues("filter-tag"); const stars = checkedValues("filter-star");
  return samples.filter(sample => sample.projectId === state.projectId && !sample.trashed && (!query || sample.alias.toLowerCase().includes(query) || sample.id.includes(query)) && (!eligibility.length || eligibility.includes(sample.eligibility)) && (!progress.length || progress.some(value => value === "completed" ? sample.analysisStatus === "completed" : sample.analysisStatus !== "completed")) && (!assignees.length || assignees.some(value => value === "unassigned" ? !sample.assignee : sample.assignee === value)) && (!tags.length || tags.some(value => value === "未標記" ? !sample.tags.length : sample.tags.includes(value))) && (!stars.length || stars.includes(sample.star)));
}
function statusBadge(sample) { if (sample.analysisStatus === "completed") return `<b class="work-state done">${esc(sample.completedBy)} 完成分析</b>`; if (sample.analysisStatus === "in_progress") return `<b class="work-state active">${esc(sample.assignee)} 正在分析</b>`; return `<b class="work-state idle">尚未指派</b>`; }
function starLabel(color) { return project().stars.find(star => star.color === color)?.label || ""; }
function starHex(starOrColor) { const star = typeof starOrColor === "string" ? project().stars.find(item => item.color === starOrColor) : starOrColor; return star?.hex || ({ red: "#d95c45", gold: "#b77b15", blue: "#3478a6" })[star?.color || starOrColor] || "#66736d"; }
function renderSamples() {
  const filtered = filteredSamples(); const pages = Math.max(1, Math.ceil(filtered.length / pageSize)); state.samplePage = Math.min(state.samplePage, pages); const page = filtered.slice((state.samplePage - 1) * pageSize, state.samplePage * pageSize);
  $("#sample-count").textContent = `${filtered.length} 份樣本 · 第 ${state.samplePage} / ${pages} 頁`;
  const root = $("#sample-rows"); root.replaceChildren();
  page.forEach(sample => { const row = document.createElement("button"); row.type = "button"; row.className = `sample-row${state.selectedSampleId === sample.id ? " selected" : ""}`; row.innerHTML = `<div class="row-star"><i class="star ${sample.star ? "" : "none"}" style="color:${sample.star ? starHex(sample.star) : ""}">${sample.star ? "★" : "—"}</i><small>${esc(starLabel(sample.star))}</small></div><div><h3>${esc(sample.alias)} · ${esc(sample.eligibility)}</h3><p>${shortId(sample.id)}</p>${statusBadge(sample)}</div><div class="tag-list">${(sample.tags.length ? sample.tags : ["未標記"]).map(tag => `<b>${esc(tag)}</b>`).join("")}</div><span>${formatBytes(sample.bytes)}</span>`; row.onclick = () => { state.selectedSampleId = state.selectedSampleId === sample.id ? null : sample.id; renderSamples(); }; root.append(row); if (state.selectedSampleId === sample.id) root.append(renderSampleDetail(sample)); });
  const pagination = $("#pagination"); pagination.replaceChildren(); for (let number = 1; number <= pages; number++) { const button = document.createElement("button"); button.textContent = number; button.classList.toggle("active", number === state.samplePage); button.onclick = () => { state.samplePage = number; state.selectedSampleId = null; renderSamples(); }; pagination.append(button); }
}
function renderSampleDetail(sample) {
  const detail = document.createElement("section"); detail.className = "inline-detail"; const completedByOther = sample.analysisStatus === "completed" && sample.completedBy !== currentResearcher;
  detail.innerHTML = `<header class="detail-head"><div><label>研究化名<input class="alias-input" value="${esc(sample.alias)}"></label><p>${sample.id}</p></div><strong>${formatBytes(sample.bytes)}</strong></header><section class="assignment"><div><strong>負責研究人員</strong><span>${esc(sample.assignee || "尚未指派")}</span></div><button class="claim">${sample.assignee ? "改由我負責" : "由我負責"}</button><label>分析狀態<select class="analysis-status"><option value="in_progress">正在分析</option><option value="completed">完成分析</option></select></label></section>${completedByOther ? `<section class="edit-mode"><strong>${esc(sample.completedBy)} 已完成分析，請選擇異動方式</strong><div><button data-mode="comment">增加註解</button><button data-mode="modify">直接修改</button></div><textarea hidden rows="3"></textarea></section>` : ""}<section class="change-log"><h3>分析紀錄</h3>${sample.changes.length ? sample.changes.map(change => `<p>${esc(change)}</p>`).join("") : "<span>尚無異動紀錄</span>"}</section><section class="detail-section"><h3>第一語言資格</h3><div class="eligibility">${["符合", "不符合", "無法判定"].map(value => `<button data-value="${value}" class="${sample.eligibility === value ? "selected" : ""}">${value}</button>`).join("")}</div><audio controls src="../assets/device-test-music.wav"></audio><textarea rows="2" placeholder="資格判定理由"></textarea></section><section class="detail-section"><h3>該專案彩色星號的標籤</h3><div class="star-picker"><button class="star-option ${!sample.star ? "selected" : ""}" data-star="">× <span>移除</span></button>${project().stars.map(star => `<button class="star-option ${sample.star === star.color ? "selected" : ""}" data-star="${star.color}"><i class="star ${star.color}">★</i><span>${esc(star.label)}</span></button>`).join("")}</div></section><section class="detail-section"><h3>問題一回答分析</h3><audio controls src="../assets/stimulus-01.wav"></audio><label>回答文字<textarea class="answer" rows="4" placeholder="輸入受試者所說的文字">${esc(sample.answer)}</textarea></label><div class="analysis-tags"></div></section><div class="form-actions"><button class="secondary finish-edit">結束編輯</button><button class="danger move-trash">移至垃圾桶</button></div>`;
  $$('[data-star]', detail).forEach(button => { const icon = $(".star", button); const star = project().stars.find(item => item.color === button.dataset.star); if (icon && star) icon.style.color = starHex(star); });
  $(".alias-input", detail).oninput = event => { const next = event.target.value.trim(); if (!next) return; sample.alias = next; const heading = detail.previousElementSibling?.querySelector("h3"); if (heading) heading.textContent = `${sample.alias} · ${sample.eligibility}`; toast("研究化名已同步"); };
  $(".claim", detail).onclick = () => { sample.assignee = currentResearcher; sample.analysisStatus = "in_progress"; sample.changes.push(nowChange(`${currentResearcher} 開始分析`)); renderSamples(); toast("已指派給目前登入的研究人員"); };
  const status = $(".analysis-status", detail); status.value = sample.analysisStatus === "unassigned" ? "in_progress" : sample.analysisStatus; status.onchange = () => updateAnalysisStatus(sample, status.value);
  $$(".eligibility button", detail).forEach(button => button.onclick = () => { sample.eligibility = button.dataset.value; renderSamples(); toast("資格判定已儲存"); });
  $$('[data-star]', detail).forEach(button => button.onclick = () => { sample.star = button.dataset.star || null; renderSamples(); toast("星號標籤已同步"); });
  $$("[data-mode]", detail).forEach(button => button.onclick = () => { const mode = button.dataset.mode === "comment" ? "增加註解" : "直接修改"; const box = $(".edit-mode textarea", detail); box.hidden = false; box.placeholder = `${mode}內容`; sample.changes.push(nowChange(`${currentResearcher} ${mode}`)); toast(`${mode}模式已開啟`); });
  $(".answer", detail).oninput = event => { sample.answer = event.target.value; toast("回答文字已自動儲存"); };
  const analysisRoot = $(".analysis-tags", detail); project().tags.forEach(tag => { const block = document.createElement("div"); block.className = "analysis-block"; block.innerHTML = `<label><input type="checkbox"><span>${esc(tag.label)}</span></label><div class="reason" hidden><label>出現位置或判定原因<textarea rows="3"></textarea></label></div>`; const checkbox = $("input", block); checkbox.checked = sample.tags.includes(tag.label); $(".reason", block).hidden = !checkbox.checked; $("textarea", block).value = sample.reasons[tag.label] || ""; checkbox.onchange = () => { sample.tags = checkbox.checked ? [...new Set([...sample.tags, tag.label])] : sample.tags.filter(value => value !== tag.label); $(".reason", block).hidden = !checkbox.checked; renderSamples(); toast("分析標籤已同步"); }; $("textarea", block).oninput = event => sample.reasons[tag.label] = event.target.value; analysisRoot.append(block); });
  $(".finish-edit", detail).onclick = () => finishEditing(sample);
  $(".move-trash", detail).onclick = () => confirmAction("移至垃圾桶", `將「${sample.alias}」移至垃圾桶？30 天內可還原。`, null, () => moveSampleToTrash(sample));
  return detail;
}
function nowChange(text) { return `2026.10.8 12:21 ${text}`; }
function updateAnalysisStatus(sample, value) { sample.assignee ||= currentResearcher; sample.analysisStatus = value; if (value === "completed") sample.completedBy = currentResearcher; sample.changes.push(nowChange(`${currentResearcher} ${value === "completed" ? "完成分析" : "正在分析"}`)); renderSamples(); toast("分析狀態已自動儲存"); }
function finishEditing(sample) { if (sample.analysisStatus === "completed") { state.selectedSampleId = null; renderSamples(); return; } const dialog = $("#completion-dialog"); dialog.returnValue = ""; dialog.showModal(); dialog.onclose = () => { if (dialog.returnValue === "complete") updateAnalysisStatus(sample, "completed"); else { sample.assignee ||= currentResearcher; sample.analysisStatus = "in_progress"; state.selectedSampleId = null; renderSamples(); } }; }
function moveSampleToTrash(sample) { sample.trashed = true; const item = projectById(sample.projectId); item.sampleCount = Math.max(0, item.sampleCount - 1); item.activeBytes = Math.max(0, item.activeBytes - sample.bytes); item.trashBytes += sample.bytes; trashItems.push(trashItem(`t-${sample.id}`, sample.projectId, sample.alias, sample.bytes, "2026-10-08", 30)); state.selectedSampleId = null; renderAll(); toast("樣本已移至垃圾桶"); }

function renderTagEditors() {
  const item = project(); const tagsRoot = $("#tag-editor"); tagsRoot.replaceChildren();
  item.tags.forEach(tag => { const row = document.createElement("div"); row.className = "editor-row tag-editor-row"; row.innerHTML = `<span>⋮⋮</span><input value="${esc(tag.label)}"><label><input type="checkbox" ${tag.reason ? "checked" : ""}>需填原因</label><span>${tag.used} 份</span><button class="danger remove-tag">移除</button>`; const inputs = $$("input", row); let previous = tag.label; inputs[0].oninput = () => { const next = inputs[0].value.trim(); if (!next) return; tag.label = next; samples.filter(sample => sample.projectId === item.id).forEach(sample => sample.tags = sample.tags.map(value => value === previous ? next : value)); previous = next; renderSampleFilters(); renderSamples(); toast("標籤名稱已全面同步"); }; inputs[1].onchange = () => tag.reason = inputs[1].checked; $(".remove-tag", row).onclick = () => confirmAction("移除樣本分析標籤", `移除「${tag.label}」後，所有樣本上的該標籤與原因也會清除。`, null, () => removeTag(item, tag)); tagsRoot.append(row); });
  const starsRoot = $("#star-definition-editor"); starsRoot.replaceChildren(); item.stars.forEach(star => { const row = document.createElement("div"); row.className = "editor-row star-editor-row"; row.innerHTML = `<input class="star-color" type="color" value="${starHex(star)}" aria-label="${esc(star.label)}星號顏色"><i class="star" style="color:${starHex(star)}">★</i><input class="star-label" value="${esc(star.label)}"><span>${star.used} 份</span><button class="danger remove-star">刪除</button>`; $(".star-label", row).oninput = event => { const next = event.target.value.trim(); if (!next) return; star.label = next; renderSampleFilters(); renderSamples(); toast("星號文字已全面同步"); }; $(".star-color", row).oninput = event => { star.hex = event.target.value; $(".star", row).style.color = starHex(star); renderSampleFilters(); renderSamples(); }; $(".remove-star", row).onclick = () => confirmAction("刪除彩色星號標籤", `刪除「${star.label}」後，已套用此星號的樣本會改為無星號。`, null, () => removeStar(item, star)); starsRoot.append(row); });
}
function removeTag(item, tag) { item.tags = item.tags.filter(entry => entry !== tag); samples.filter(sample => sample.projectId === item.id).forEach(sample => { sample.tags = sample.tags.filter(label => label !== tag.label); delete sample.reasons[tag.label]; }); renderProject(); toast("標籤與樣本標記已移除"); }
function removeStar(item, star) { item.stars = item.stars.filter(entry => entry !== star); samples.filter(sample => sample.projectId === item.id && sample.star === star.color).forEach(sample => sample.star = null); renderProject(); toast("彩色星號標籤已刪除"); }
function renderTasks() {
  const root = $("#task-list"); root.replaceChildren();
  project().tasks.forEach(task => {
    const row = document.createElement("div"); row.className = "task-wrap";
    row.innerHTML = `<div class="item-row"><strong>${task.id}</strong><div><b>${esc(task.title)}</b><span>${esc(task.audio)}</span></div><span class="status-pill ${task.published ? "on" : "off"}">${task.published ? "啟用中" : "已停用"}</span><button class="secondary task-edit">${state.selectedTaskId === task.id ? "收合" : "編輯"}</button></div>`;
    $(".task-edit", row).onclick = () => { state.selectedTaskId = state.selectedTaskId === task.id ? null : task.id; renderTasks(); };
    if (state.selectedTaskId === task.id) row.append(renderTaskEditor(task)); root.append(row);
  });
}
function renderTaskEditor(task) {
  const editor = document.createElement("section"); editor.className = "task-editor";
  editor.innerHTML = `<div class="task-form"><label>題目名稱<input class="task-title" value="${esc(task.title)}"></label><label>說明／註解<textarea class="task-instructions" rows="3">${esc(task.instructions || "")}</textarea></label><label>題目音檔 MP4／WAV<input class="task-media" type="file" accept=".mp4,.wav,audio/mp4,audio/wav,video/mp4"><small>${esc(task.audio || "尚未選擇檔案")}</small></label><label class="toggle-line"><input class="task-published" type="checkbox" ${task.published ? "checked" : ""}>在受試者端啟用</label></div><audio controls preload="metadata" src="${esc(task.src || "")}"></audio><div class="form-actions"><button type="button" class="danger task-remove">移除題目</button><button type="button" class="secondary task-cancel">取消</button><button type="button" class="primary task-save">儲存題目</button></div>`;
  $(".task-remove", editor).onclick = () => confirmAction("移除題目", `移除「${task.title}」及其題目音檔設定？`, null, () => { project().tasks = project().tasks.filter(entry => entry !== task); state.selectedTaskId = null; renderTasks(); toast("題目已移除"); });
  $(".task-cancel", editor).onclick = () => { state.selectedTaskId = null; renderTasks(); };
  $(".task-save", editor).onclick = () => { task.title = $(".task-title", editor).value.trim() || task.title; task.instructions = $(".task-instructions", editor).value; task.published = $(".task-published", editor).checked; state.selectedTaskId = null; renderTasks(); toast(`題目已儲存並設為${task.published ? "啟用中" : "已停用"}`); };
  $(".task-media", editor).onchange = event => { const selected = event.target.files[0]; if (!selected) return; const error = validateMediaFile(selected); if (error) { event.target.value = ""; toast(error); return; } if (task.objectUrl) URL.revokeObjectURL(task.objectUrl); task.audio = selected.name; task.objectUrl = URL.createObjectURL(selected); task.src = task.objectUrl; renderTasks(); toast("題目音檔已加入草稿"); };
  return editor;
}
function renderNotes() { const notes = project().notes; $("#division-note").value = notes.division; $("#analysis-note").value = notes.analysis; $("#note-history").innerHTML = notes.history.map(row => `<li>${esc(row)}</li>`).join(""); }

function renderPermissionPicker(root, selected, prefix) { root.innerHTML = Object.entries(permissionGroups).map(([group, permissions]) => `<section class="permission-group"><strong>${group}</strong>${permissions.map(([key, label]) => `<label><input type="checkbox" name="${prefix}" value="${key}" ${selected.includes(key) ? "checked" : ""}>${label}</label>`).join("")}</section>`).join(""); }
function renderMembers() {
  const item = project(); renderPermissionPicker($("#permission-picker"), researcherDefaults, "new-permission"); const root = $("#member-list"); root.replaceChildren();
  item.members.forEach(member => { const button = document.createElement("button"); button.type = "button"; button.classList.toggle("active", state.selectedMemberEmail === member.email); button.innerHTML = `<strong>${esc(member.displayName)}</strong><span>${member.owner ? "最高階研究員 · 權限受保護" : member.admin ? "專案管理員" : "研究人員"}<br>${esc(member.email)}</span><b>${member.owner ? "編輯名稱" : "編輯"}</b>`; button.onclick = () => { state.selectedMemberEmail = member.email; renderMembers(); }; root.append(button); }); renderMemberEditor();
}
function renderMemberEditor() {
  const root = $("#member-editor"); const member = project().members.find(item => item.email === state.selectedMemberEmail); if (!member) { root.className = "member-editor empty"; root.innerHTML = "<p>選擇研究人員以編輯名稱及專案權限。</p>"; return; }
  if (member.owner) { root.className = "member-editor"; root.innerHTML = `<h3>專案擁有者</h3><label>系統顯示名稱<input id="owner-display-name" value="${esc(member.displayName)}"></label><p>可修改顯示名稱；email、最高權限、擁有者身分及不可移除保護不會變更。</p><div class="member-actions"><button id="save-owner-name" class="primary">儲存並同步名稱</button></div>`; $("#save-owner-name").onclick = () => { const old = member.displayName; const next = $("#owner-display-name").value.trim(); if (!next) { toast("顯示名稱不可空白"); return; } projects.forEach(projectItem => projectItem.members.filter(entry => entry.owner).forEach(entry => entry.displayName = next)); samples.forEach(sample => { if (sample.assignee === old) sample.assignee = next; if (sample.completedBy === old) sample.completedBy = next; }); renderProject(); toast("專案擁有者顯示名稱已在系統同步"); }; return; }
  root.className = "member-editor"; root.innerHTML = `<h3>編輯研究人員</h3><label>顯示名稱<input id="member-display-name" value="${esc(member.displayName)}"></label><label class="toggle-line"><input id="member-admin" type="checkbox" ${member.admin ? "checked" : ""}>專案管理員</label><div id="edit-permissions" class="permission-picker"></div><div class="member-actions"><button id="save-member" class="primary">儲存並同步</button><button id="remove-member" class="danger">移除研究人員</button></div>`; renderPermissionPicker($("#edit-permissions"), member.permissions, "edit-permission");
  $("#save-member").onclick = () => { const old = member.displayName; member.displayName = $("#member-display-name").value.trim() || old; member.admin = $("#member-admin").checked; member.permissions = checkedValues("edit-permission"); samples.forEach(sample => { if (sample.assignee === old) sample.assignee = member.displayName; if (sample.completedBy === old) sample.completedBy = member.displayName; }); renderProject(); toast("研究員名稱與權限已全面同步"); };
  $("#remove-member").onclick = () => confirmAction("移除研究人員", `移除 ${member.displayName} 的本專案存取權？`, null, () => { project().members = project().members.filter(item => item.email !== member.email); samples.filter(sample => sample.projectId === project().id && sample.assignee === member.displayName).forEach(sample => sample.assignee = null); state.selectedMemberEmail = null; renderProject(); toast("研究人員已移除"); });
}

function renderDesigner() {
  const item = project(); const form = $("#project-design-form"); form.elements.name.value = item.name; form.elements.status.value = item.status; form.elements.maxSubmissions.value = item.maxSubmissions; form.elements.slug.value = item.slug;
  const list = $("#page-list"); list.replaceChildren(); item.pages.forEach(page => { const button = document.createElement("button"); button.type = "button"; button.className = `secondary${item.selectedPage === page.key ? " active" : ""}`; button.textContent = page.label; button.onclick = () => { item.selectedPage = page.key; renderDesigner(); }; list.append(button); });
  const page = item.pages.find(row => row.key === item.selectedPage) || item.pages[0]; page.blocks ||= []; form.elements.pageTitle.value = page.title; form.elements.pageBody.value = page.body; form.elements.footer.value = item.footer; $("#published-url").textContent = `https://research.example/study/${item.slug}`; $("#delete-page").hidden = !page.key.startsWith("custom-"); renderBlockEditor(); renderParticipantPreview();
}
function saveDesign() { const item = project(); const form = $("#project-design-form"); const page = item.pages.find(row => row.key === item.selectedPage); item.name = form.elements.name.value.trim() || item.name; item.status = form.elements.status.value; item.maxSubmissions = Number(form.elements.maxSubmissions.value); item.slug = form.elements.slug.value.trim() || item.slug; page.title = form.elements.pageTitle.value; page.body = form.elements.pageBody.value; item.footer = form.elements.footer.value; $("#project-save-state").textContent = "所有變更已儲存 · 剛剛"; renderAll(); }
function renderBlockEditor() {
  const page = project().pages.find(row => row.key === project().selectedPage); page.blocks ||= []; const root = $("#block-list"); root.replaceChildren();
  if (!page.blocks.length) root.innerHTML = '<div class="empty-state">此頁目前沒有額外欄位。</div>';
  page.blocks.forEach((block, index) => {
    const row = document.createElement("div"); const configurable = ["select_field", "single_choice", "multiple_choice"].includes(block.type); const media = ["device_audio", "speech_task"].includes(block.type); row.className = "block-row";
    row.innerHTML = `<span>⋮⋮</span><input class="block-label-input" value="${esc(block.label)}"><span>${blockTypeLabel(block.type)}</span><div class="block-actions"><button type="button" title="上移">↑</button><button type="button" title="下移">↓</button><button type="button" title="複製">⧉</button><button type="button" title="刪除" class="text-danger">×</button></div><div class="block-config">${block.type !== "divider" ? `<label><input class="required-toggle" type="checkbox" ${block.required ? "checked" : ""}>必填</label>` : ""}<label>說明／註解<input class="block-note" value="${esc(block.note || "")}" placeholder="可留白"></label>${configurable ? `<label>選項（每行一個）<textarea class="block-options" rows="3">${esc(block.options || "選項一\n選項二")}</textarea></label>` : ""}${media ? `<label>題目媒體 MP4／WAV<input class="block-media" type="file" accept=".mp4,.wav,audio/mp4,audio/wav,video/mp4"><small>${esc(block.fileName || "尚未選擇檔案")}</small></label>` : ""}</div>`;
    $(".block-label-input", row).oninput = event => { block.label = event.target.value; renderParticipantPreview(); }; const note = $(".block-note", row); if (note) note.oninput = event => { block.note = event.target.value; renderParticipantPreview(); }; const required = $(".required-toggle", row); if (required) required.onchange = event => block.required = event.target.checked; const options = $(".block-options", row); if (options) options.oninput = event => { block.options = event.target.value; renderParticipantPreview(); }; const file = $(".block-media", row); if (file) file.onchange = () => { const selected = file.files[0]; if (!selected) return; const error = validateMediaFile(selected); if (error) { file.value = ""; toast(error); return; } if (block.objectUrl) URL.revokeObjectURL(block.objectUrl); block.fileName = selected.name; block.fileSize = selected.size; block.objectUrl = URL.createObjectURL(selected); block.src = block.objectUrl; renderBlockEditor(); renderParticipantPreview(); toast("媒體已加入專案草稿，尚未發布"); };
    const buttons = $$(".block-actions button", row); buttons[0].disabled = index === 0; buttons[0].onclick = () => moveBlock(index, -1); buttons[1].disabled = index === page.blocks.length - 1; buttons[1].onclick = () => moveBlock(index, 1); buttons[2].onclick = () => { page.blocks.splice(index + 1, 0, { ...block, id: crypto.randomUUID(), objectUrl: null }); renderBlockEditor(); renderParticipantPreview(); toast("欄位已複製"); }; buttons[3].onclick = () => { page.blocks.splice(index, 1); renderBlockEditor(); renderParticipantPreview(); toast("欄位已從草稿移除"); }; root.append(row);
  });
}
function validateMediaFile(file) { const name = file.name.toLowerCase(); if (!ALLOWED_MEDIA_EXTENSIONS.some(extension => name.endsWith(extension))) return "僅支援 MP4 或 WAV 題目媒體"; if (file.size > MAX_MEDIA_BYTES) return "單一題目媒體不可超過 50 MB"; return ""; }
function blockTypeLabel(type) { return ({ heading: "標題", paragraph: "段落", text_field: "文字", number_field: "數字", select_field: "下拉選單", single_choice: "單選", multiple_choice: "複選", repeatable_text: "可重複欄位", notice: "醒目說明", device_audio: "設備媒體", speech_task: "口說題目", completion_download: "完成下載", divider: "分隔線" })[type] || type; }
function moveBlock(index, direction) { const page = project().pages.find(row => row.key === project().selectedPage); const target = index + direction; if (target < 0 || target >= page.blocks.length) return; [page.blocks[index], page.blocks[target]] = [page.blocks[target], page.blocks[index]]; renderBlockEditor(); renderParticipantPreview(); }
function renderParticipantPreview() { const item = project(); const page = item.pages.find(row => row.key === item.selectedPage); const blocks = (page.blocks || []).map(previewBlock).join(""); $("#participant-preview").innerHTML = `<small>${esc(page.label)}</small><h2>${esc(page.title)}</h2><p>${esc(page.body)}</p>${blocks}<button class="primary">下一步</button><footer>${esc(item.footer)}</footer>`; }
function previewBlock(block) { const note = block.note ? `<small>${esc(block.note)}</small>` : ""; const required = block.required ? "<b>必填</b>" : ""; if (block.type === "notice") return `<div class="preview-notice">${esc(block.label)}</div>`; if (block.type === "heading") return `<h3>${esc(block.label)}</h3>`; if (block.type === "paragraph") return `<p>${esc(block.label)}</p>`; if (block.type === "divider") return "<hr>"; if (["device_audio", "speech_task"].includes(block.type)) return `<section class="preview-media"><strong>${esc(block.label)} ${required}</strong>${note}<audio controls src="${esc(block.src || "")}"></audio><span>${esc(block.fileName || "尚未上傳 MP4／WAV")}${block.fileSize ? ` · ${formatBytes(block.fileSize)}` : ""}</span></section>`; if (block.type === "completion_download") return `<button class="primary" type="button">${esc(block.label)}</button>`; if (block.type === "repeatable_text") return `<label class="preview-field">${esc(block.label)} ${required}${note}<input disabled placeholder="受試者填寫"><button class="secondary" type="button">＋ 新增另一欄</button></label>`; if (block.type === "select_field") return `<label class="preview-field">${esc(block.label)} ${required}${note}<select disabled><option>請選擇</option>${choiceOptions(block).map(option => `<option>${esc(option)}</option>`).join("")}</select></label>`; if (["single_choice", "multiple_choice"].includes(block.type)) return `<fieldset class="preview-field"><legend>${esc(block.label)} ${required}</legend>${note}${choiceOptions(block).map(option => `<label><input disabled type="${block.type === "single_choice" ? "radio" : "checkbox"}"> ${esc(option)}</label>`).join("")}</fieldset>`; return `<label class="preview-field">${esc(block.label)} ${required}${note}<input disabled type="${block.type === "number_field" ? "number" : "text"}" placeholder="受試者填寫"></label>`; }
function choiceOptions(block) { return (block.options || "選項一\n選項二").split("\n").map(option => option.trim()).filter(Boolean); }

function renderCapacity() {
  const available = projects.filter(item => !item.trashed); const total = available.reduce((sum, item) => sum + projectTotal(item), 0); const trash = available.reduce((sum, item) => sum + item.trashBytes, 0);
  $("#capacity-summary").innerHTML = metric("平台 R2 容量", formatBytes(total), `免費額度使用 ${pct(total, FREE_R2_BYTES)}`) + metric("免費額度剩餘", formatBytes(Math.max(0, FREE_R2_BYTES - total)), `${pct(Math.max(0, FREE_R2_BYTES - total), FREE_R2_BYTES)} 尚可用`) + metric("垃圾桶容量", formatBytes(trash), "永久刪除後才會釋放", "warn") + metric("D1 使用狀態", "0.18 GB", "模擬值 · 免費上限 5 GB");
  $("#capacity-sync-time").textContent = `最近同步：${state.capacitySyncedAt}`;
  const root = $("#capacity-projects"); root.replaceChildren(); available.forEach(item => { const card = document.createElement("article"); card.className = "capacity-card"; card.innerHTML = `<div><span class="state ${statusClass(item.status)}">${statusLabels[item.status]}</span><h2>${esc(item.name)}</h2><p>${item.sampleCount} 份樣本 · 上限 ${item.maxSubmissions}</p></div><div class="capacity-numbers"><div><span>有效語音</span><strong>${formatBytes(item.activeBytes)}</strong></div><div><span>垃圾桶</span><strong>${formatBytes(item.trashBytes)}</strong></div><div><span>專案總容量</span><strong>${formatBytes(projectTotal(item))}</strong></div><div><span>占全部專案</span><strong>${pct(projectTotal(item), total)}</strong></div><div><span>占免費額度</span><strong>${pct(projectTotal(item), FREE_R2_BYTES)}</strong></div><div><span>免費額度總剩餘</span><strong>${pct(Math.max(0, FREE_R2_BYTES - total), FREE_R2_BYTES)}</strong></div><div class="bar"><i style="width:${Math.min(100, projectTotal(item) / FREE_R2_BYTES * 100)}%"></i></div></div><div class="capacity-actions"><select aria-label="${esc(item.name)}專案狀態">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}" ${item.status === value ? "selected" : ""}>${label}</option>`).join("")}</select><button data-action="delete-audio">所有受試者語音移至垃圾桶</button><button data-action="delete-project" class="danger">整個專案移至垃圾桶</button></div>`;
    $("select", card).onchange = event => { item.status = event.target.value; renderAll(); toast(`${item.name} 已更新為${statusLabels[item.status]}`); };
    $('[data-action="delete-audio"]', card).onclick = () => confirmAction("全部語音移至垃圾桶", `保留「${item.name}」設定與分析文字，將全部受試者語音移至垃圾桶。`, item.name, () => moveProjectAudioToTrash(item));
    $('[data-action="delete-project"]', card).onclick = () => confirmAction("整個專案移至垃圾桶", `專案、設定、樣本與音檔將一起進入垃圾桶。`, item.name, () => moveProjectToTrash(item)); root.append(card);
  });
}
function moveProjectAudioToTrash(item) { const rows = samples.filter(sample => sample.projectId === item.id && !sample.trashed); rows.forEach(sample => { sample.trashed = true; trashItems.push(trashItem(`bulk-${sample.id}`, item.id, sample.alias, sample.bytes, "2026-10-08", 30)); }); item.trashBytes += item.activeBytes; item.activeBytes = 0; item.sampleCount = 0; renderAll(); toast("專案全部語音已移至垃圾桶"); }
function moveProjectToTrash(item) { item.trashed = true; item.status = "archived"; trashItems.push({ id: `project-${item.id}`, projectId: item.id, alias: item.name, bytes: projectTotal(item), deletedAt: "2026-10-08", daysLeft: 30, kind: "project" }); renderAll(); switchMain("capacity"); toast("整個專案已移至垃圾桶"); }

function renderCreateStep() {
  const names = ["basic", "content", "analysis", "review"]; const current = names[state.createStep]; $$(".create-step").forEach(step => step.classList.toggle("active", step.dataset.stepPanel === current)); $$(".create-steps button").forEach((button, index) => button.classList.toggle("active", index === state.createStep)); $("#create-prev").disabled = state.createStep === 0; $("#create-next").hidden = state.createStep === names.length - 1;
  if (current === "review") { const form = $("#create-project-form"); $("#create-review").innerHTML = [["專案名稱", form.elements.name.value || "尚未填寫"], ["網址", form.elements.slug.value || "尚未填寫"], ["初始狀態", statusLabels[form.elements.status.value]], ["收錄上限", `${form.elements.maxSubmissions.value} 份`], ["容量警示", `${form.elements.capacityLimit.value} GB`]].map(([label, value]) => `<div><span>${label}</span><strong>${esc(value)}</strong></div>`).join(""); }
}
function createProject(event) { event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return; if (!form.elements.confirm.checked) { toast("請先確認專案保護設定"); return; } const slug = form.elements.slug.value.trim(); if (projects.some(item => item.slug === slug && !item.trashed)) { toast("網址識別碼已存在"); return; } const item = makeProject(crypto.randomUUID(), form.elements.name.value.trim(), slug, form.elements.status.value, 0, 0, 0, Number(form.elements.maxSubmissions.value)); item.capacityLimit = Number(form.elements.capacityLimit.value) * GB; item.notes.analysis = form.elements.initialNote.value; item.tags = checkedValues("defaultTag").map(label => ({ label, used: 0, reason: true, active: true })); item.pages.find(page => page.key === "start").title = form.elements.startTitle.value; item.pages.find(page => page.key === "consent").title = form.elements.consentTitle.value; item.pages.find(page => page.key === "background").body = form.elements.backgroundText.value; item.pages.find(page => page.key === "device").body = form.elements.deviceText.value; item.pages.find(page => page.key === "complete").body = form.elements.completionText.value; item.footer = form.elements.footer.value; projects.push(item); state.projectId = item.id; form.reset(); state.createStep = 0; renderAll(); openProject(item.id); switchProjectPane("designer"); toast("研究專案已建立為可編輯版本"); }

function filteredTrash() { const value = $("#trash-project-filter").value; return trashItems.filter(item => value === "all" || item.projectId === value); }
function renderTrash() {
  const select = $("#trash-project-filter"); const previous = select.value || "all"; select.innerHTML = `<option value="all">全部專案</option>` + projects.map(item => `<option value="${item.id}">${esc(item.name)}</option>`).join(""); select.value = [...select.options].some(option => option.value === previous) ? previous : "all";
  const rows = filteredTrash(); const bytes = rows.reduce((sum, item) => sum + item.bytes, 0); const platformTotal = projects.filter(item => !item.trashed).reduce((sum, item) => sum + projectTotal(item), 0) + projects.filter(item => item.trashed).reduce((sum, item) => sum + projectTotal(item), 0);
  $("#trash-total").textContent = `${rows.length} 項，共 ${formatBytes(bytes)}`; $("#trash-release").textContent = `預計 30 天內釋放：${formatBytes(bytes)}（占目前使用容量 ${pct(bytes, platformTotal)}）`; $("#trash-nav-count").textContent = trashItems.length;
  const groups = Map.groupBy ? Map.groupBy(rows, item => item.deletedAt) : rows.reduce((map, item) => map.set(item.deletedAt, [...(map.get(item.deletedAt) || []), item]), new Map()); const root = $("#trash-groups"); root.replaceChildren();
  if (!rows.length) root.innerHTML = '<div class="empty-state">目前篩選範圍沒有垃圾桶項目。</div>';
  [...groups.entries()].sort(([a], [b]) => b.localeCompare(a)).forEach(([date, items]) => { const section = document.createElement("section"); section.className = "trash-date"; const allSelected = items.every(item => state.trashSelected.has(item.id)); section.innerHTML = `<header class="trash-date-head"><label><input type="checkbox" ${allSelected ? "checked" : ""}>全選 ${date}</label><strong>${items.length} 項</strong><span>${formatBytes(items.reduce((sum, item) => sum + item.bytes, 0))}</span></header>${items.map(item => `<div class="trash-row"><input type="checkbox" value="${item.id}" aria-label="選取 ${esc(item.alias)}" ${state.trashSelected.has(item.id) ? "checked" : ""}><div><strong>${item.kind === "project" ? "專案：" : "樣本："}${esc(item.alias)}</strong><span>${esc(projectById(item.projectId)?.name || "已刪除專案")}</span></div>${item.kind === "sample" ? `<audio controls preload="none" src="../assets/stimulus-01.wav" aria-label="去識別化語音預聽 ${esc(item.alias)}"></audio>` : "<span>專案項目無單一預聽</span>"}<span>${formatBytes(item.bytes)}</span><small>剩餘 ${item.daysLeft} 天</small></div>`).join("")}`;
    $(".trash-date-head input", section).onchange = event => { items.forEach(item => event.target.checked ? state.trashSelected.add(item.id) : state.trashSelected.delete(item.id)); renderTrash(); };
    $$(".trash-row input", section).forEach(input => input.onchange = () => { input.checked ? state.trashSelected.add(input.value) : state.trashSelected.delete(input.value); renderTrash(); }); root.append(section);
  });
  const visibleIds = new Set(rows.map(item => item.id)); const selectedVisible = rows.filter(item => state.trashSelected.has(item.id)); const allVisible = rows.length > 0 && selectedVisible.length === rows.length; $("#trash-select-all").checked = allVisible; $("#trash-select-all").indeterminate = selectedVisible.length > 0 && !allVisible; $("#trash-selection").textContent = `已選 ${selectedVisible.length} 項 · ${formatBytes(selectedVisible.reduce((sum, item) => sum + item.bytes, 0))}`; $("#restore-selected").disabled = !selectedVisible.length; $("#delete-selected").disabled = !selectedVisible.length; [...state.trashSelected].filter(id => !trashItems.some(item => item.id === id)).forEach(id => state.trashSelected.delete(id));
}
function restoreTrash(ids) { const target = trashItems.filter(item => ids.has(item.id)); target.forEach(row => { const item = projectById(row.projectId); if (row.kind === "project") item.trashed = false; else { item.trashBytes = Math.max(0, item.trashBytes - row.bytes); item.activeBytes += row.bytes; item.sampleCount += 1; const sample = samples.find(entry => `t-${entry.id}` === row.id || `bulk-${entry.id}` === row.id); if (sample) sample.trashed = false; } }); trashItems = trashItems.filter(item => !ids.has(item.id)); ids.forEach(id => state.trashSelected.delete(id)); renderAll(); toast(`已還原 ${target.length} 項`); }
function deleteTrash(ids) { const target = trashItems.filter(item => ids.has(item.id)); target.forEach(row => { const item = projectById(row.projectId); if (row.kind !== "project" && item) item.trashBytes = Math.max(0, item.trashBytes - row.bytes); }); trashItems = trashItems.filter(item => !ids.has(item.id)); ids.forEach(id => state.trashSelected.delete(id)); renderAll(); toast(`已永久刪除 ${target.length} 項並釋放容量`); }

function confirmAction(title, message, expected, action) { const dialog = $("#confirm-dialog"); $("#confirm-title").textContent = title; $("#confirm-message").textContent = message; $("#confirm-input-wrap").hidden = !expected; $("#confirm-input").value = ""; $("#confirm-action").disabled = Boolean(expected); if (expected) $("#confirm-input").oninput = event => $("#confirm-action").disabled = event.target.value !== expected; dialog.returnValue = ""; dialog.showModal(); dialog.onclose = () => { if (dialog.returnValue === "confirm") action(); }; }
function renderAll() { renderHome(); renderProject(); renderCapacity(); renderTrash(); }

const blockTypes = [["heading", "標題"], ["paragraph", "段落／註解"], ["notice", "醒目說明"], ["text_field", "文字欄位"], ["number_field", "數字欄位"], ["select_field", "下拉選單"], ["single_choice", "單選欄位"], ["multiple_choice", "複選欄位"], ["repeatable_text", "可重複文字欄位"], ["device_audio", "設備測試媒體"], ["speech_task", "口說題目"], ["completion_download", "完成畫面下載"], ["divider", "分隔線"]];
$("#block-type").replaceChildren(...blockTypes.map(([value, label]) => new Option(label, value)));
const deletePageButton = document.createElement("button"); deletePageButton.id = "delete-page"; deletePageButton.type = "button"; deletePageButton.className = "danger"; deletePageButton.textContent = "刪除目前自訂頁面"; deletePageButton.hidden = true; $("#add-page").after(deletePageButton);

$$('[data-main-link]').forEach(element => element.onclick = event => { event.preventDefault(); switchMain(element.dataset.mainLink); });
$$(".main-nav").forEach(button => button.onclick = () => switchMain(button.dataset.view));
$$(".project-tab").forEach(button => button.onclick = () => switchProjectPane(button.dataset.projectView));
$$("[data-go]").forEach(button => button.onclick = () => switchProjectPane(button.dataset.go));
$("#project-select").onchange = event => { state.projectId = event.target.value; state.selectedSampleId = null; state.selectedMemberEmail = null; renderProject(); };
$("#copy-url").onclick = () => { navigator.clipboard?.writeText(`https://research.example/study/${project().slug}`); toast("受試者網址已複製"); };
$("#sample-search").oninput = () => { state.samplePage = 1; renderSamples(); };
$("#clear-filters").onclick = () => { $$('.filters input[type="checkbox"]').forEach(input => input.checked = false); $("#sample-search").value = ""; state.samplePage = 1; renderSamples(); };
$("#export-results").onclick = () => toast(`已準備匯出 ${filteredSamples().length} 份篩選結果`);
$("#add-tag").onclick = () => { project().tags.push({ label: `新標籤 ${project().tags.length + 1}`, used: 0, reason: true }); renderProject(); };
$("#add-star").onclick = () => { project().stars.push({ color: `custom-${crypto.randomUUID()}`, hex: "#7352a3", label: `新星號標籤 ${project().stars.length + 1}`, used: 0, active: true }); renderProject(); toast("已新增可自訂顏色的星號標籤"); };
$("#add-task").onclick = () => { const number = Math.max(0, ...project().tasks.map(task => Number(task.id) || 0)) + 1; const task = { id: String(number).padStart(2, "0"), title: `問題${number}`, instructions: "", audio: "尚未上傳", src: "", published: false }; project().tasks.push(task); state.selectedTaskId = task.id; renderTasks(); toast("已新增題目，請完成內容後儲存"); };
$("#member-form").elements.is_admin.onchange = event => $("#permission-section").hidden = !event.target.checked;
$("#member-form").onsubmit = event => { event.preventDefault(); const form = event.currentTarget; const email = form.elements.email.value.trim().toLowerCase(); if (project().members.some(member => member.email === email)) { toast("這個 email 已在專案中"); return; } const admin = form.elements.is_admin.checked; project().members.push({ email, displayName: form.elements.display_name.value.trim(), owner: false, admin, permissions: admin ? checkedValues("new-permission") : [...researcherDefaults] }); form.reset(); $("#permission-section").hidden = true; renderProject(); toast("研究人員已加入並同步權限"); };
$("#revoke-all").onclick = () => confirmAction("撤銷所有其他研究人員", "保留最高階專案擁有者，撤銷其他研究人員的本專案存取權。", project().name, () => { project().members = project().members.filter(member => member.owner); samples.filter(sample => sample.projectId === project().id).forEach(sample => sample.assignee = null); state.selectedMemberEmail = null; renderProject(); toast("已撤銷所有其他研究人員"); });
$$('.autosave').forEach(textarea => textarea.oninput = () => { const notes = project().notes; notes.division = $("#division-note").value; notes.analysis = $("#analysis-note").value; const label = $("#save-state"); label.textContent = "正在儲存…"; label.classList.add("saving"); clearTimeout(renderNotes.timer); renderNotes.timer = setTimeout(() => { notes.history.unshift(`${currentResearcher} · 剛剛`); label.textContent = "所有變更已儲存 · 剛剛"; label.classList.remove("saving"); }, 700); });
$("#project-design-form").onsubmit = event => { event.preventDefault(); saveDesign(); toast("專案設計草稿已儲存"); };
$("#project-design-form").oninput = () => { $("#project-save-state").textContent = "尚未儲存的變更"; const form = $("#project-design-form"); const page = project().pages.find(row => row.key === project().selectedPage); page.title = form.elements.pageTitle.value; page.body = form.elements.pageBody.value; project().footer = form.elements.footer.value; renderParticipantPreview(); };
$("#preview-project").onclick = () => { renderParticipantPreview(); toast("右側已更新受試者預覽"); };
$("#publish-project").onclick = () => { saveDesign(); project().version += 1; project().publishedAt = "2026/10/8 12:21"; toast(`已建立第 ${project().version} 版發布快照`); };
$("#add-page").onclick = () => { const item = project(); const key = `custom-${crypto.randomUUID()}`; item.pages.push({ key, label: `自訂頁面 ${item.pages.length - 5}`, title: "自訂頁面", body: "請輸入頁面說明。", blocks: [] }); item.selectedPage = key; renderDesigner(); };
$("#delete-page").onclick = () => { const item = project(); const page = item.pages.find(entry => entry.key === item.selectedPage); if (!page?.key.startsWith("custom-")) return; confirmAction("刪除自訂頁面", `刪除「${page.label}」及頁面內所有欄位？`, null, () => { item.pages = item.pages.filter(entry => entry !== page); item.selectedPage = "start"; renderDesigner(); toast("自訂頁面已刪除"); }); };
$("#add-block").onclick = () => { const page = project().pages.find(row => row.key === project().selectedPage); const type = $("#block-type").value; page.blocks ||= []; const labels = { heading: "新標題", paragraph: "新的說明或註解", notice: "新的醒目說明", device_audio: "設備測試聲音", speech_task: `口說題目 ${page.blocks.filter(block => block.type === "speech_task").length + 1}`, completion_download: "下載完成證明圖片", divider: "分隔線" }; page.blocks.push({ id: crypto.randomUUID(), type, label: labels[type] || "新欄位", options: ["select_field", "single_choice", "multiple_choice"].includes(type) ? "選項一\n選項二" : "" }); renderBlockEditor(); renderParticipantPreview(); toast("欄位已加入目前頁面草稿"); };
$("#refresh-capacity").onclick = () => { state.capacitySyncedAt = "剛剛（模擬 R2 對帳完成）"; renderCapacity(); toast("已完成容量帳本校正"); };
$$(".create-steps button").forEach((button, index) => button.onclick = () => { state.createStep = index; renderCreateStep(); });
$("#create-prev").onclick = () => { state.createStep = Math.max(0, state.createStep - 1); renderCreateStep(); };
$("#create-next").onclick = () => { state.createStep = Math.min(3, state.createStep + 1); renderCreateStep(); };
$("#create-project-form").onsubmit = createProject;
$("#trash-project-filter").onchange = () => { state.trashSelected.clear(); renderTrash(); };
$("#trash-select-all").onchange = event => { filteredTrash().forEach(item => event.target.checked ? state.trashSelected.add(item.id) : state.trashSelected.delete(item.id)); renderTrash(); };
$("#restore-selected").onclick = () => restoreTrash(new Set(state.trashSelected));
$("#delete-selected").onclick = () => { const ids = new Set(state.trashSelected); confirmAction("永久刪除所選項目", `永久刪除 ${ids.size} 項後無法還原。`, null, () => deleteTrash(ids)); };
$("#empty-trash").onclick = () => confirmAction("永久清空垃圾桶", `永久刪除全部 ${trashItems.length} 項後無法還原。`, "永久清空", () => deleteTrash(new Set(trashItems.map(item => item.id))));

renderAll();
renderCreateStep();
