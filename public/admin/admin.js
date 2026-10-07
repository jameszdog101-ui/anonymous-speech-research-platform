const $ = (selector, root = document) => root.querySelector(selector);
const rows = $("#submission-rows");
const detailPane = $("#detail-pane");
const alertBox = $("#alert");

async function api(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `伺服器錯誤 (${response.status})`);
  return payload;
}

function showError(error) { alertBox.textContent = error.message; alertBox.hidden = false; }
function showPanelAlert(selector, message, success = false) { const box = $(selector); box.textContent = message; box.hidden = false; box.classList.toggle("success", success); }
function reviewLabel(value) { return ({ eligible:"符合", ineligible:"不符合", undetermined:"無法判定" })[value] || "待審核"; }
function statusLabel(value) { return value === "completed" ? "已完成" : "進行中"; }
function shortId(value) { return `${value.slice(0, 8)}…`; }
function dateLabel(value) { return value ? new Intl.DateTimeFormat("zh-TW", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value)) : "—"; }

async function loadSummary() {
  const data = await api("../admin/api/summary");
  $("#metric-total").textContent = data.total;
  $("#metric-completed").textContent = data.completed;
  $("#metric-progress").textContent = data.in_progress;
  $("#metric-pending").textContent = data.pending_review;
}

let collectionOpen = true;
async function loadCollectionControl() {
  const data = await api("../admin/api/study-control");
  collectionOpen = data.open;
  $("#collection-form").elements.max_submissions.value = data.max_submissions;
  $("#collection-state").textContent = data.open ? "受試者端目前開放收件" : "受試者端目前已停止收件";
  $("#collection-count").textContent = `已建立 ${data.accepted_submissions} 份提交，已完成 ${data.completed_submissions} 份，剩餘 ${data.remaining} 個名額。`;
  $("#collection-control").classList.toggle("is-closed", !data.open);
  const toggle = $("#toggle-collection");
  toggle.textContent = data.open ? "立即關閉收件" : "重新開放收件";
  toggle.classList.toggle("close-study", data.open);
}

async function saveCollectionControl(open) {
  const maximum = Number($("#collection-form").elements.max_submissions.value);
  const data = await api("../admin/api/study-control", { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ open, max_submissions:maximum }) });
  await loadCollectionControl();
  showPanelAlert("#alert", data.open ? "收件設定已儲存，受試者端目前開放。" : "收件已關閉；新的參與者無法建立提交。", true);
}

async function loadSubmissions() {
  const status = $("#status-filter").value;
  const data = await api(`../admin/api/submissions${status ? `?status=${status}` : ""}`);
  rows.replaceChildren();
  if (!data.submissions.length) { rows.innerHTML = '<tr><td colspan="5" class="empty">目前沒有符合條件的提交。</td></tr>'; return; }
  data.submissions.forEach((submission) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td class="id"></td><td><span class="pill"></span></td><td></td><td><span class="pill pending"></span></td><td></td>`;
    row.cells[0].textContent = shortId(submission.id);
    $(".pill", row.cells[1]).textContent = statusLabel(submission.status);
    row.cells[2].textContent = submission.first_language;
    const review = $(".pill", row.cells[3]); review.textContent = reviewLabel(submission.eligibility_status); if (submission.eligibility_status) review.classList.remove("pending");
    row.cells[4].textContent = dateLabel(submission.completed_at || submission.created_at);
    row.addEventListener("click", () => loadDetail(submission.id));
    rows.append(row);
  });
}

async function loadDetail(id) {
  const data = await api(`../admin/api/submissions/${encodeURIComponent(id)}`);
  const fragment = $("#detail-template").content.cloneNode(true);
  Object.entries(data.submission).forEach(([key, value]) => { const node = fragment.querySelector(`[data-field="${key}"]`); if (node) node.textContent = key === "status" ? statusLabel(value) : value ?? "—"; });
  const recordings = $("#recordings", fragment);
  data.recordings.forEach((recording) => {
    const item = document.createElement("article"); item.className = "recording";
    const audioUrl = `../admin/api/submissions/${encodeURIComponent(id)}/tasks/${encodeURIComponent(recording.task_id)}/audio`;
    item.innerHTML = `<header><strong></strong><a download>下載 WAV</a></header><audio controls preload="none"></audio>`;
    $("strong", item).textContent = `${recording.task_id} · ${recording.transform_profile} v${recording.transform_version}`;
    $("a", item).href = `${audioUrl}?download=1`; $("audio", item).src = audioUrl; recordings.append(item);
  });
  const form = $("#review-form", fragment);
  form.elements.eligibility_status.value = data.submission.eligibility_status || "";
  form.elements.notes.value = data.submission.review_notes || "";
  form.addEventListener("submit", async (event) => { event.preventDefault(); try { await api(`../admin/api/submissions/${encodeURIComponent(id)}/review`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ eligibility_status:form.elements.eligibility_status.value, notes:form.elements.notes.value }) }); await Promise.all([loadSummary(), loadSubmissions(), loadDetail(id)]); } catch (error) { showError(error); } });
  $("#close-detail", fragment).addEventListener("click", () => { detailPane.innerHTML = '<div class="empty-detail"><strong>選擇一筆匿名提交</strong><span>查看背景資料、去識別化錄音及資格審核。</span></div>'; });
  detailPane.replaceChildren(fragment);
}

async function loadAll() { alertBox.hidden = true; try { await Promise.all([loadSummary(), loadSubmissions(), loadCollectionControl()]); } catch (error) { showError(error); rows.innerHTML = '<tr><td colspan="5" class="empty">無法載入資料。</td></tr>'; } }
$("#refresh").addEventListener("click", loadAll);
$("#status-filter").addEventListener("change", () => loadSubmissions().catch(showError));
$("#collection-form").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveCollectionControl(collectionOpen); } catch (error) { showError(error); } });
$("#toggle-collection").addEventListener("click", async () => { const action = collectionOpen ? "關閉" : "重新開放"; if (!confirm(`確定要${action}研究收件？`)) return; try { await saveCollectionControl(!collectionOpen); } catch (error) { showError(error); } });

document.querySelectorAll(".nav-tab").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".nav-tab").forEach((tab) => tab.classList.toggle("active", tab === button));
  document.querySelectorAll(".admin-view").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === button.dataset.view));
  if (button.dataset.view === "researchers") loadResearchers();
  if (button.dataset.view === "tasks") loadTasks();
}));

async function loadResearchers() {
  const body = $("#researcher-rows");
  try {
    const data = await api("../admin/api/researchers");
    body.replaceChildren();
    data.researchers.forEach((researcher) => {
      const row = document.createElement("tr");
      row.innerHTML = "<td></td><td></td><td></td><td class=\"row-actions\"></td>";
      row.cells[0].textContent = researcher.email;
      row.cells[1].textContent = researcher.is_owner ? "最高權限擁有者" : researcher.role === "manager" ? "管理者" : "研究者";
      row.cells[2].textContent = researcher.status === "active" ? "啟用" : "已停用";
      if (researcher.is_owner) row.cells[3].textContent = "不可變更";
      else {
        const toggle = document.createElement("button"); toggle.textContent = researcher.status === "active" ? "停用" : "啟用";
        toggle.addEventListener("click", async () => { await api(`../admin/api/researchers/${encodeURIComponent(researcher.email)}`, { method:"PATCH", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status:researcher.status === "active" ? "disabled" : "active" }) }); loadResearchers(); });
        const remove = document.createElement("button"); remove.className = "text-danger"; remove.textContent = "移除";
        remove.addEventListener("click", async () => { if (!confirm(`確定移除 ${researcher.email}？`)) return; await api(`../admin/api/researchers/${encodeURIComponent(researcher.email)}`, { method:"DELETE" }); loadResearchers(); });
        row.cells[3].append(toggle, remove);
      }
      body.append(row);
    });
  } catch (error) { body.innerHTML = '<tr><td colspan="4" class="empty">無法載入研究者。</td></tr>'; showPanelAlert("#researcher-alert", error.message); }
}

$("#researcher-form").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; try { await api("../admin/api/researchers", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email:form.elements.email.value, role:form.elements.role.value }) }); form.reset(); showPanelAlert("#researcher-alert", "研究者已新增。", true); loadResearchers(); } catch (error) { showPanelAlert("#researcher-alert", error.message); } });
$("#refresh-researchers").addEventListener("click", loadResearchers);
$("#revoke-all").addEventListener("click", async () => { if (!confirm("確定撤銷所有其他研究者的存取權？最高權限擁有者不受影響。")) return; try { await api("../admin/api/researchers/revoke-all", { method:"POST" }); showPanelAlert("#researcher-alert", "所有其他研究者均已停用。", true); loadResearchers(); } catch (error) { showPanelAlert("#researcher-alert", error.message); } });

let taskDrafts = [];
function editTask(task = {}) { const form = $("#task-form"); form.hidden = false; for (const name of ["task_id","title","prompt_text","research_instructions","max_playbacks","max_recordings"]) form.elements[name].value = task[name] ?? (name.startsWith("max_") ? 2 : ""); $("#task-audio-preview").hidden = !task.audio_url; $("#task-audio-preview").src = task.audio_url || ""; }
async function loadTasks() { try { const data = await api("../admin/api/tasks"); taskDrafts = data.tasks; $("#publish-status").textContent = data.published_at ? `上次發布：${dateLabel(data.published_at)}` : "尚未發布"; const list = $("#task-list"); list.replaceChildren(); taskDrafts.forEach((task, index) => { const item = document.createElement("article"); item.className="task-item"; item.innerHTML='<span class="task-order"></span><div class="task-copy"><strong></strong><span></span></div><button type="button">編輯</button>'; $(".task-order",item).textContent=String(index+1).padStart(2,"0"); $("strong",item).textContent=task.title; $(".task-copy span",item).textContent=`${task.task_id} · ${task.audio_url ? "已有音檔" : "尚無音檔"}`; $("button",item).addEventListener("click",()=>editTask(task)); list.append(item); }); if (!taskDrafts.length) list.innerHTML='<p class="empty">尚未建立題目。</p>'; } catch(error){ showPanelAlert("#task-alert",error.message); } }
$("#new-task").addEventListener("click",()=>editTask({ task_id:`task_${String(taskDrafts.length+1).padStart(3,"0")}` }));
$("#task-form").addEventListener("submit", async (event) => { event.preventDefault(); const form=event.currentTarget; const payload=Object.fromEntries(new FormData(form)); delete payload.audio; payload.max_playbacks=Number(payload.max_playbacks); payload.max_recordings=Number(payload.max_recordings); try { await api(`../admin/api/tasks/${encodeURIComponent(payload.task_id)}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}); if(form.elements.audio.files[0]) await api(`../admin/api/tasks/${encodeURIComponent(payload.task_id)}/audio`,{method:"PUT",headers:{"Content-Type":form.elements.audio.files[0].type},body:form.elements.audio.files[0]}); showPanelAlert("#task-alert","題目草稿已儲存。",true); await loadTasks(); editTask(taskDrafts.find((task)=>task.task_id===payload.task_id)); } catch(error){ showPanelAlert("#task-alert",error.message); } });
$("#delete-task").addEventListener("click",async()=>{const id=$("#task-form").elements.task_id.value;if(!id||!confirm(`確定刪除 ${id}？`))return;try{await api(`../admin/api/tasks/${encodeURIComponent(id)}`,{method:"DELETE"});$("#task-form").hidden=true;loadTasks();}catch(error){showPanelAlert("#task-alert",error.message);}});
$("#publish-tasks").addEventListener("click",async()=>{if(!confirm("確定發布目前草稿？受試者端將讀取這一版題目與音檔。"))return;try{await api("../admin/api/tasks/publish",{method:"POST"});showPanelAlert("#task-alert","題目已發布到受試者端。",true);loadTasks();}catch(error){showPanelAlert("#task-alert",error.message);}});
loadAll();
