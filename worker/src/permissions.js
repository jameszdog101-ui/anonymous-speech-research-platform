export const PROJECT_PERMISSION_GROUPS = Object.freeze({
  project: ["project_create", "project_edit_basic", "project_open_close", "project_limit_manage", "project_url_manage", "project_archive", "project_view_audit"],
  participant: ["participant_content_edit", "participant_fields_edit", "participant_consent_edit", "participant_footer_edit", "participant_preview", "participant_publish", "participant_rollback"],
  tasks: ["task_view", "task_edit", "task_audio_upload", "task_reorder", "task_disable", "task_publish"],
  samples: ["sample_view_all", "sample_assign_self", "sample_assign_others", "sample_edit_analysis", "sample_complete_analysis", "sample_reopen_analysis", "sample_comment", "sample_direct_edit", "sample_alias_edit", "sample_star_edit"],
  analysis: ["tag_manage", "tag_reason_rule_manage", "star_definition_manage", "research_notes_edit", "research_notes_history"],
  members: ["member_view", "member_add_researcher", "member_edit_display_name", "member_disable", "member_remove", "member_assign_permissions", "member_revoke_all"],
  exports: ["audio_play", "audio_download", "metadata_export", "filtered_export", "project_export_all"],
  capacity: ["capacity_view_project", "capacity_view_account", "capacity_refresh", "capacity_limit_manage", "collection_auto_close_manage"],
  trash: ["trash_view", "trash_restore", "trash_bulk_restore"]
});

export const ALL_PROJECT_PERMISSIONS = new Set(Object.values(PROJECT_PERMISSION_GROUPS).flat());

export const OWNER_ONLY_ACTIONS = new Set([
  "sample_move_to_trash",
  "sample_permanent_delete",
  "project_samples_delete_all",
  "project_move_to_trash",
  "project_audio_move_all_to_trash",
  "trash_empty",
  "trash_permanent_delete",
  "project_delete",
  "system_owner_manage",
  "cloudflare_secrets_manage"
]);

export const ELEVATED_GRANT_PERMISSIONS = new Set([
  "member_assign_permissions",
  "member_revoke_all",
  "participant_publish",
  "task_publish"
]);

export function validateProjectPermissions(values) {
  if (!Array.isArray(values)) return "permissions 必須是陣列。";
  const unique = new Set(values);
  if (unique.size !== values.length) return "permissions 不可重複。";
  for (const value of values) {
    if (!ALL_PROJECT_PERMISSIONS.has(value)) return `未知的專案權限：${value}`;
  }
  return null;
}

export function canGrantPermission({ actorIsOwner, actorPermissions }, permission) {
  if (!ALL_PROJECT_PERMISSIONS.has(permission)) return false;
  if (actorIsOwner) return true;
  if (ELEVATED_GRANT_PERMISSIONS.has(permission)) return false;
  return new Set(actorPermissions || []).has(permission);
}

