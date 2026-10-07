export const STUDY_CONFIG = Object.freeze({
  studyId: "speech-pilot-001",
  version: "0.1.0",
  maxRecordingSeconds: 30,
  transformProfile: Object.freeze({
    id: "PROFILE_A",
    version: "1.0.0",
    playbackRate: 0.92,
    highpassHz: 110,
    formantDipHz: 1800,
    formantDipDb: -4,
    presenceHz: 3200,
    presenceDb: 3,
    lowpassHz: 7000
  }),
  tasks: Object.freeze([
    Object.freeze({
      task_id: "task_001",
      title: "短句複誦",
      prompt_text: "聽到提示音後，請朗讀：「今天天氣很好，我們一起去散步。」",
      audio_stimulus: "/assets/stimulus-01.wav",
      research_instructions: "請使用平常說話的速度與音量。錄音最長 30 秒。",
      play_once: false,
      replay_allowed: true
    }),
    Object.freeze({
      task_id: "task_002",
      title: "語句回應",
      prompt_text: "聽到提示音後，請用一至兩句話回答：你平常最常使用哪一種語言？",
      audio_stimulus: "/assets/stimulus-02.wav",
      research_instructions: "內容沒有標準答案，請自然作答。錄音最長 30 秒。",
      play_once: true,
      replay_allowed: false
    })
  ])
});

