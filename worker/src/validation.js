export const ALLOWED_PROFILE_FIELDS = Object.freeze([
  "age_group",
  "biological_sex",
  "nationality",
  "language_background",
  "first_language",
  "second_languages",
  "mandarin_learning_years"
]);

export const AGE_GROUPS = new Set(["under_18", "18_24", "25_34", "35_44", "45_54", "55_plus"]);
export const BIOLOGICAL_SEXES = new Set(["male", "female"]);
export const LANGUAGE_BACKGROUNDS = new Set(["monolingual", "bilingual", "multilingual"]);
export const TASK_IDS = new Set(["task_001", "task_002"]);
export const TRANSFORM_PROFILES = Object.freeze({
  PROFILE_A_M: "2.0.0",
  PROFILE_A_F: "2.0.0"
});
export const TRANSFORM_PARAMETER_SETS = Object.freeze({
  PROFILE_A_M: Object.freeze({ pitchSemitones: 4, formantScale: 1.18, modulationDepthMs: 2.2, modulationRateHz: 4.7 }),
  PROFILE_A_F: Object.freeze({ pitchSemitones: -4, formantScale: 0.84, modulationDepthMs: 2.6, modulationRateHz: 5.3 })
});
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

function isShortText(value) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 40;
}

export function validateSubmissionPayload(payload) {
  if (!payload || typeof payload !== "object" || payload.consent !== true) {
    return "必須確認研究同意後才能建立提交。";
  }
  if (typeof payload.study_id !== "string" || typeof payload.study_version !== "string") {
    return "研究版本資料不完整。";
  }
  const profile = payload.profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return "背景資料格式不正確。";

  const keys = Object.keys(profile);
  if (keys.some((key) => !ALLOWED_PROFILE_FIELDS.includes(key)) || ALLOWED_PROFILE_FIELDS.some((key) => !(key in profile))) {
    return "背景資料包含未允許或缺少的欄位。";
  }
  if (!AGE_GROUPS.has(profile.age_group)) return "年齡區間不正確。";
  if (!BIOLOGICAL_SEXES.has(profile.biological_sex)) return "生理性別欄位不正確。";
  if (!LANGUAGE_BACKGROUNDS.has(profile.language_background)) return "語言背景不正確。";
  if (!isShortText(profile.nationality)) return "國籍欄位格式不正確。";
  if (!isShortText(profile.first_language)) return "第一語言欄位格式不正確。";
  if (!Array.isArray(profile.second_languages) || profile.second_languages.length > 6 || profile.second_languages.some((language) => !isShortText(language))) {
    return "第二語言欄位格式不正確。";
  }
  if (profile.language_background !== "monolingual" && profile.second_languages.length === 0) {
    return "雙語或多語背景至少需要填寫一個第二語言。";
  }
  if (typeof profile.mandarin_learning_years !== "number" || !Number.isFinite(profile.mandarin_learning_years) || profile.mandarin_learning_years < 0 || profile.mandarin_learning_years > 80) {
    return "華語學習時間不正確。";
  }
  return null;
}

export function validateAudioRequest(request, taskId) {
  if (!TASK_IDS.has(taskId)) return "未知的語音題目。";
  if (request.headers.get("Content-Type")?.split(";")[0] !== "audio/wav") return "只接受轉換後的 WAV 音檔。";
  if (request.headers.get("X-Audio-State") !== "transformed") return "拒絕未標記為已轉換的音訊。";
  const profile = request.headers.get("X-Transform-Profile");
  if (!Object.hasOwn(TRANSFORM_PROFILES, profile)) return "聲音轉換設定不正確。";
  if (request.headers.get("X-Transform-Version") !== TRANSFORM_PROFILES[profile]) return "聲音轉換版本不正確。";
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > MAX_AUDIO_BYTES) return "音檔超過大小限制。";
  return null;
}

export function transformProfileForSex(biologicalSex) {
  if (biologicalSex === "male") return "PROFILE_A_M";
  if (biologicalSex === "female") return "PROFILE_A_F";
  return null;
}

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function hasWavHeader(value) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.length < 12) return false;
  return String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WAVE";
}

