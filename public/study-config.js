export const STUDY_CONFIG = Object.freeze({
  studyId: "speech-pilot-001",
  version: "0.4.0",
  maxRecordingSeconds: 30,
  eligibilityTask: Object.freeze({
    task_id: "eligibility_001",
    purpose: "first_language_and_recording_quality_check"
  }),
  transformProfiles: Object.freeze({
    male: Object.freeze({
      id: "PROFILE_A_M",
      version: "2.0.1",
      pitchSemitones: 3,
      formantScale: 1.12,
      formantCentersHz: Object.freeze([500, 1500, 2500]),
      modulationDepthMs: 0,
      modulationRateHz: 0,
      highpassHz: 100,
      lowpassHz: 7200,
      targetRms: 0.14,
      frameSize: 1024,
      analysisHop: 256
    }),
    female: Object.freeze({
      id: "PROFILE_A_F",
      version: "2.0.1",
      pitchSemitones: -3,
      formantScale: 0.89,
      formantCentersHz: Object.freeze([500, 1500, 2500]),
      modulationDepthMs: 0,
      modulationRateHz: 0,
      highpassHz: 90,
      lowpassHz: 6500,
      targetRms: 0.14,
      frameSize: 1024,
      analysisHop: 256
    })
  }),
  tasks: Object.freeze([
    Object.freeze({
      task_id: "task_001",
      title: "您的題目",
      prompt_text: "請按「播放問題」聽完內容，再完整複誦：「今天天氣很好，我們一起去散步。」",
      audio_stimulus: "./assets/stimulus-01.wav",
      research_instructions: "問題可播放最多 2 次，回答可錄製最多 2 次。請使用平常說話的速度與音量，以最後一次錄音送出。",
      play_once: false,
      replay_allowed: true,
      max_playbacks: 2,
      max_recordings: 2
    }),
    Object.freeze({
      task_id: "task_002",
      title: "您的題目",
      prompt_text: "請按「播放問題」後，用一至兩句話回答：你平常最常使用哪一種語言？",
      audio_stimulus: "./assets/stimulus-02.wav",
      research_instructions: "問題可播放最多 2 次，回答可錄製最多 2 次。請使用平常說話的速度與音量，以最後一次錄音送出。",
      play_once: false,
      replay_allowed: true,
      max_playbacks: 2,
      max_recordings: 2
    })
  ])
});

