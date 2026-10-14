import test from "node:test";
import assert from "node:assert/strict";
import { createSynchronizedTask, ensureTaskSync, removeSynchronizedTask, syncBlockToTask, syncTaskToBlock } from "../public/admin/task-sync.js";

function projectFixture() {
  return {
    tasks: [
      { id: "01", title: "問題一", instructions: "回答一", audio: "one.wav", src: "/one.wav", published: true },
      { id: "02", title: "問題二", instructions: "回答二", audio: "two.wav", src: "/two.wav", published: true }
    ],
    pages: [{ key: "tasks", blocks: [{ id: "legacy", type: "speech_task", label: "舊問題" }] }]
  };
}

test("legacy task lists populate the participant speech-task page", () => {
  const project = projectFixture();
  ensureTaskSync(project);
  const blocks = project.pages[0].blocks;
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map(block => block.label), ["問題一", "問題二"]);
  assert.deepEqual(blocks.map(block => block.taskId), ["01", "02"]);
});

test("task and participant block edits share title, instructions, media and status", () => {
  const task = { id: "01", title: "新題目", instructions: "新說明", audio: "new.wav", src: "/new.wav", published: true };
  const block = syncTaskToBlock(task, { id: "block" });
  block.label = "設計器修改"; block.note = "設計器說明"; block.published = false;
  syncBlockToTask(block, task);
  assert.equal(task.title, "設計器修改");
  assert.equal(task.instructions, "設計器說明");
  assert.equal(task.audio, "new.wav");
  assert.equal(task.published, false);
});

test("adding and removing a task updates both project surfaces", () => {
  const project = projectFixture();
  ensureTaskSync(project);
  const task = createSynchronizedTask(project, { title: "問題三" });
  assert.equal(project.pages[0].blocks.at(-1).taskId, task.id);
  removeSynchronizedTask(project, task.id);
  assert.equal(project.tasks.some(row => row.id === task.id), false);
  assert.equal(project.pages[0].blocks.some(row => row.taskId === task.id), false);
});
