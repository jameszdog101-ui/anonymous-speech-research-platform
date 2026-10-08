import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  ALL_PROJECT_PERMISSIONS,
  OWNER_ONLY_ACTIONS,
  canGrantPermission,
  validateProjectPermissions
} from "../worker/src/permissions.js";

test("project permission catalog rejects unknown or repeated permissions", () => {
  assert.equal(validateProjectPermissions(["sample_edit_analysis", "audio_play"]), null);
  assert.match(validateProjectPermissions(["sample_edit_analysis", "sample_edit_analysis"]), /不可重複/);
  assert.match(validateProjectPermissions(["sample_delete"]), /未知/);
  assert.equal(ALL_PROJECT_PERMISSIONS.has("sample_move_to_trash"), false);
  assert.equal(OWNER_ONLY_ACTIONS.has("sample_move_to_trash"), true);
});

test("non-owner administrators cannot delegate elevated permissions", () => {
  assert.equal(canGrantPermission({ actorIsOwner: true, actorPermissions: [] }, "participant_publish"), true);
  assert.equal(canGrantPermission({ actorIsOwner: false, actorPermissions: ["participant_publish"] }, "participant_publish"), false);
  assert.equal(canGrantPermission({ actorIsOwner: false, actorPermissions: ["tag_manage"] }, "tag_manage"), true);
});

test("permission migration keeps display names, assignments, revisions and page versions project-scoped", async () => {
  const sql = await readFile(new URL("../worker/migrations/0003_project_permissions_and_design.sql", import.meta.url), "utf8");
  assert.match(sql, /ADD COLUMN display_name/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_permissions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS submission_assignments/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS submission_analysis_state/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS submission_analysis_revisions/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_pages/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_page_blocks/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_versions/);
});

test("capacity migration records real object bytes and reversible trash state", async () => {
  const sql = await readFile(new URL("../worker/migrations/0004_project_capacity_and_trash.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_storage_objects/);
  assert.match(sql, /byte_size INTEGER NOT NULL/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS project_capacity_snapshots/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS trash_entries/);
  assert.match(sql, /purge_after TEXT NOT NULL/);
  assert.match(sql, /source IN \('object_ledger', 'r2_reconciliation'\)/);
  assert.equal(ALL_PROJECT_PERMISSIONS.has("capacity_refresh"), true);
  assert.equal(OWNER_ONLY_ACTIONS.has("project_move_to_trash"), true);
  assert.equal(OWNER_ONLY_ACTIONS.has("trash_permanent_delete"), true);
});
