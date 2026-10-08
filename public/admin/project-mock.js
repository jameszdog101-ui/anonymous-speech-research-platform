const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const samples = [
  { id:"ac8f5580-6dc7-411c-afbb-4ff2bbb29d82", alias:"小林", size:"18.6 MB", tags:["語音偏誤"], star:"red", status:"符合" },
  { id:"f2147bc3-2319-4fd4-a912-748e0a02d471", alias:"Case J-04", size:"21.3 MB", tags:["句法偏誤","語用偏誤"], star:"blue", status:"應考慮" },
  { id:"9d652c0e-f8f2-40ab-9c3d-ddd34fa74813", alias:"美咲", size:"17.9 MB", tags:[], star:"gold", status:"符合" },
  { id:"2fa01715-54a6-470f-bf20-8eb635b61b95", alias:"Case J-09", size:"17.4 MB", tags:["語音偏誤","句法偏誤"], star:null, status:"不符合" }
];

let selectedId = null;
let tags = [
  { id:"phonology", label:"語音偏誤", used:34, active:true },
  { id:"syntax", label:"句法偏誤", used:21, active:true },
  { id:"pragmatics", label:"語用偏誤", used:12, active:true }
];

function shortId(id) { return `${id.slice(0, 8)}…${id.slice(-4)}`; }
function showToast(message) { const toast=$("#toast"); toast.textContent=message; toast.hidden=false; clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>toast.hidden=true,1800); }
function starMarkup(color) { return color ? `<i class="star ${color}" aria-hidden="true">★</i>` : `<span aria-label="未加星號">—</span>`; }

function activeFilters() { return $$('input[name="filter-tag"]:checked').map((item)=>item.value); }
function filteredSamples() {
  const filters=activeFilters(); const mode=$("#match-mode").value; const query=$("#sample-search").value.trim().toLowerCase();
  return samples.filter((sample)=>{
    const matchesSearch=!query || sample.alias.toLowerCase().includes(query) || sample.id.toLowerCase().includes(query);
    const checks=filters.map((tag)=>tag === "未標記" ? sample.tags.length === 0 : sample.tags.includes(tag));
    return matchesSearch && (!checks.length || (mode === "all" ? checks.every(Boolean) : checks.some(Boolean)));
  });
}

function renderSamples() {
  const visible=filteredSamples(); const list=$("#sample-rows"); list.replaceChildren();
  $("#sample-count").textContent=`${visible.length} 份樣本`;
  visible.forEach((sample)=>{
    const row=document.createElement("article"); row.className=`sample-row${sample.id===selectedId?" selected":""}`;
    row.innerHTML=`<div>${starMarkup(sample.star)}</div><div><h3></h3><p></p></div><div class="tag-list"></div><span class="sample-size"></span>`;
    $("h3",row).textContent=`${sample.alias} · ${sample.status}`; $("p",row).textContent=shortId(sample.id); $(".sample-size",row).textContent=sample.size;
    const tagList=$(".tag-list",row); (sample.tags.length?sample.tags:["未標記"]).forEach((tag)=>{const span=document.createElement("span");span.className="tag";span.textContent=tag;tagList.append(span)});
    row.addEventListener("click",()=>{selectedId=sample.id;renderSamples();renderDetail(sample)}); list.append(row);
  });
  if(!visible.length) list.innerHTML='<div class="empty-detail"><strong>沒有符合條件的樣本</strong><span>請調整標籤或搜尋條件。</span></div>';
}

function renderDetail(sample) {
  const pane=$("#sample-detail");
  pane.innerHTML=`<div class="detail-head"><div><h2></h2><p></p></div><strong>${sample.size}</strong></div><section class="detail-section"><h3>彩色星號</h3><div class="star-picker"><button class="star-choice" data-star="" title="移除星號">×</button><button class="star-choice red" data-star="red" title="優先複核">★</button><button class="star-choice gold" data-star="gold" title="典型樣本">★</button><button class="star-choice blue" data-star="blue" title="討論案例">★</button></div></section><section class="detail-section"><h3>專案樣本標籤</h3><div class="check-grid"></div></section><section class="detail-section"><h3>回答文字與研究備註</h3><textarea rows="7">問題一回答：\n回答文字：\n研究備註：</textarea></section>`;
  $("h2",pane).textContent=sample.alias; $("p",pane).textContent=sample.id;
  $$(".star-choice",pane).forEach((button)=>{button.classList.toggle("selected",button.dataset.star===(sample.star||""));button.addEventListener("click",()=>{sample.star=button.dataset.star||null;renderSamples();renderDetail(sample);showToast("星號已自動儲存")})});
  const grid=$(".check-grid",pane); tags.filter((tag)=>tag.active).forEach((tag)=>{const label=document.createElement("label");label.innerHTML='<input type="checkbox"> <span></span>';$("span",label).textContent=tag.label;$("input",label).checked=sample.tags.includes(tag.label);$("input",label).addEventListener("change",(event)=>{sample.tags=event.target.checked?[...sample.tags,tag.label]:sample.tags.filter((value)=>value!==tag.label);renderSamples();showToast("樣本標籤已自動儲存")});grid.append(label)});
}

function renderTagEditor() {
  const editor=$("#tag-editor"); editor.replaceChildren();
  tags.forEach((tag)=>{const row=document.createElement("div");row.className="editor-row";row.innerHTML='<span class="drag">⋮⋮</span><input type="text"><span class="used"></span><button type="button"></button>';const input=$("input",row);input.value=tag.label;$(".used",row).textContent=`${tag.used} 份使用`;const button=$("button",row);button.textContent=tag.active?"停用":"啟用";input.addEventListener("change",()=>{const old=tag.label;tag.label=input.value.trim()||old;samples.forEach((sample)=>sample.tags=sample.tags.map((value)=>value===old?tag.label:value));renderSamples();showToast("標籤名稱已更新")});button.addEventListener("click",()=>{tag.active=!tag.active;renderTagEditor();showToast(tag.active?"標籤已啟用":"標籤已停用")});editor.append(row)});
}

function renderStarEditor(){const values=[["#d95c45","優先複核",34],["#b77b15","典型樣本",19],["#3478a6","討論案例",11]];const editor=$("#star-editor");values.forEach(([color,label,count])=>{const row=document.createElement("div");row.className="editor-row";row.innerHTML=`<span class="color-swatch" style="background:${color}"></span><input type="text" value="${label}"><span class="used">${count} 份使用</span><button type="button">停用</button>`;editor.append(row)})}

$$('.nav-button').forEach((button)=>button.addEventListener("click",()=>{$$('.nav-button').forEach((item)=>item.classList.toggle("active",item===button));$$('.view').forEach((view)=>view.classList.toggle("active",view.dataset.panel===button.dataset.view))}));
$$('input[name="filter-tag"], #match-mode').forEach((input)=>input.addEventListener("change",renderSamples));
$("#sample-search").addEventListener("input",renderSamples);
$("#clear-filters").addEventListener("click",()=>{$$('input[name="filter-tag"], input[name="filter-star"]').forEach((input)=>input.checked=false);$("#sample-search").value="";renderSamples()});
$("#copy-url").addEventListener("click",()=>showToast("模擬受試者網址已複製"));
$("#add-tag").addEventListener("click",()=>{tags.push({id:crypto.randomUUID(),label:"新標籤",used:0,active:true});renderTagEditor();showToast("已新增標籤")});
let saveTimer; $$('.autosave').forEach((textarea)=>textarea.addEventListener("input",()=>{const state=$("#save-state");state.textContent="正在儲存…";state.classList.add("saving");clearTimeout(saveTimer);saveTimer=setTimeout(()=>{state.textContent="所有變更已儲存 · 剛剛";state.classList.remove("saving")},800)}));

renderSamples(); renderTagEditor(); renderStarEditor();
