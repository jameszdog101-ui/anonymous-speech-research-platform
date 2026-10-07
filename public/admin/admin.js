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

async function loadAll() { alertBox.hidden = true; try { await Promise.all([loadSummary(), loadSubmissions()]); } catch (error) { showError(error); rows.innerHTML = '<tr><td colspan="5" class="empty">無法載入資料。</td></tr>'; } }
$("#refresh").addEventListener("click", loadAll);
$("#status-filter").addEventListener("change", () => loadSubmissions().catch(showError));
loadAll();
