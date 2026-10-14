function taskPage(project) {
  return project.pages?.find(page => page.key === "tasks") || null;
}

function newBlockId(taskId) {
  return globalThis.crypto?.randomUUID?.() || `task-block-${taskId}`;
}

export function nextTaskId(project) {
  const number = Math.max(0, ...(project.tasks || []).map(task => Number(task.id) || 0)) + 1;
  return String(number).padStart(2, "0");
}

export function syncTaskToBlock(task, block) {
  block.taskId = task.id;
  block.type = "speech_task";
  block.label = task.title;
  block.note = task.instructions || "";
  block.fileName = task.audio || "尚未上傳";
  block.src = task.src || "";
  block.objectUrl = task.objectUrl || null;
  block.published = Boolean(task.published);
  return block;
}

export function syncBlockToTask(block, task) {
  task.title = block.label;
  task.instructions = block.note || "";
  task.audio = block.fileName || "尚未上傳";
  task.src = block.src || "";
  task.objectUrl = block.objectUrl || null;
  task.published = Boolean(block.published);
  return task;
}

export function ensureTaskSync(project) {
  project.tasks ||= [];
  const page = taskPage(project);
  if (!page) return project.tasks;
  page.blocks ||= [];
  const speechBlocks = page.blocks.filter(block => block.type === "speech_task");
  const claimed = new Set();

  project.tasks.forEach((task, index) => {
    let block = speechBlocks.find(entry => entry.taskId === task.id && !claimed.has(entry));
    block ||= speechBlocks.find(entry => !entry.taskId && !claimed.has(entry));
    if (!block) {
      block = { id: newBlockId(task.id), type: "speech_task" };
      page.blocks.push(block);
    }
    claimed.add(block);
    syncTaskToBlock(task, block);
  });

  speechBlocks.filter(block => !claimed.has(block)).forEach(block => {
    const task = { id: nextTaskId(project), published: Boolean(block.published) };
    block.taskId = task.id;
    project.tasks.push(syncBlockToTask(block, task));
  });
  syncTaskOrderFromPage(project);
  return project.tasks;
}

export function createSynchronizedTask(project, values = {}) {
  const page = taskPage(project);
  if (!page) throw new Error("專案缺少口說任務頁");
  const id = nextTaskId(project);
  const task = { id, title: `問題${Number(id)}`, instructions: "", audio: "尚未上傳", src: "", published: false, ...values };
  const block = syncTaskToBlock(task, { id: newBlockId(id), type: "speech_task" });
  project.tasks.push(task); page.blocks ||= []; page.blocks.push(block);
  syncTaskOrderFromPage(project);
  return task;
}

export function createTaskFromBlock(project, block) {
  const id = nextTaskId(project);
  block.taskId = id;
  block.published ??= false;
  const task = syncBlockToTask(block, { id });
  project.tasks.push(task);
  syncTaskOrderFromPage(project);
  return task;
}

export function removeSynchronizedTask(project, taskId) {
  project.tasks = (project.tasks || []).filter(task => task.id !== taskId);
  const page = taskPage(project);
  if (page) page.blocks = (page.blocks || []).filter(block => block.taskId !== taskId);
}

export function taskForBlock(project, block) {
  return (project.tasks || []).find(task => task.id === block.taskId) || null;
}

export function syncTaskOrderFromPage(project) {
  const page = taskPage(project);
  if (!page) return;
  const order = new Map((page.blocks || []).filter(block => block.type === "speech_task").map((block, index) => [block.taskId, index]));
  project.tasks.sort((a, b) => (order.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}
