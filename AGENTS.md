# Agent Project Context

## Project identity

- Chinese name: 匿名語音研究平台系統
- English name: Zero-Cost Automated Speech Research Platform
- Purpose: provide an anonymous browser-based workflow for speech-research participants to read instructions, hear an audio stimulus, record a response, transform the voice locally, and submit research data.
- Primary deployment direction: Cloudflare Pages for the participant web interface, Cloudflare Workers for APIs, D1 for metadata, and R2 for processed audio files.
- Google Sites may be used only as an introduction or entry page linking to the application. It is not the recording application or the data-storage backend.

## Confirmed MVP scope

The first version must contain only the basic participant submission flow and data storage. Do not build the full researcher dashboard in this MVP.

The participant flow is:

1. Open the study page.
2. Read the study information and research instructions.
3. Give consent.
4. Enter the permitted background information.
5. Complete a short test set of speech tasks.
6. Listen to the supplied audio stimulus according to the task rules.
7. Record a spoken response.
8. Apply the fixed voice-transformation profile locally in the browser.
9. Upload only the transformed audio and allowed metadata.
10. See a submission confirmation or a clear retryable error.

Keep the test version short. The exact number of tasks and exact recording duration have not yet been fixed, so make them configuration values rather than hard-coded product rules.

## Participant data fields

The MVP may collect only these background fields:

- `age_group`
- `biological_sex` (`male` or `female`; used only to select the transform sub-profile)
- `nationality`
- `language_background` (derived as `bilingual` or `multilingual`; never `monolingual` in this study)
- `first_language`
- `second_languages` (array; must contain fixed `中文（普通話）`, followed by any optional additional languages)
- `mandarin_learning_years` (years learning Mandarin/Chinese/Putonghua)

Do not collect:

- name
- student ID
- telephone number
- private email address
- full date of birth
- street or full residential address
- national identification number

Do not introduce another directly identifying field without explicit user confirmation.

## Task model

Every speech task must support these fields:

- `task_id`: stable task identifier
- prompt text: the text shown to the participant
- audio stimulus: researcher-supplied audio file or URL
- research instructions: instructions specific to the task
- play-once flag: whether the stimulus may be played only once
- replay-allowed flag: whether repeat playback is permitted
- maximum playback attempts (MVP rule: 2)
- maximum recording attempts (MVP rule: 2)

Stimulus files may be MP3 or WAV. Validate supported browser playback and show a usable error when a supplied file cannot be played.

The play-once and replay-allowed fields describe the same playback policy and must not be allowed to contradict one another. In the current MVP, each question may be played at most twice and each answer may be recorded at most twice. Prefer a single canonical policy in code, while preserving both requested concepts in configuration/API mapping if needed.

Before formal tasks begin, participants must complete a local device test. The browser speaks "請從數字一數到十", the participant records themselves counting from one to ten, and the recording is transformed with the same sex-specific PROFILE_A v2 settings before being played back locally. Device-test audio, whether raw or transformed, must never be uploaded or persisted.

The initial screen provides a platform-language choice through Google Translate. Traditional Chinese remains available as the source-language fallback if the external translation service is unavailable.

## Voice transformation and privacy rule

Use the fixed versioned `PROFILE_A v2.0.1` algorithm with two user-selected biological-sex sub-profiles. `PROFILE_A_M` applies the male-path parameters and `PROFILE_A_F` applies the female-path parameters. Participants cannot tune or select parameters beyond the required `biological_sex` background field. Do not infer sex from the recording. The v2.0.1 profile uses a moderate fixed pitch/formant shift and disables periodic micro-modulation so artificial trembling does not interfere with intonation analysis.

The v2 test profiles perform duration-preserving pitch shift, formant-band reshaping, deterministic micro-modulation, mono downmixing, band limiting, soft limiting, and RMS normalization in a module Web Worker. Male uses approximately +4 semitones and a 1.18 formant scale; female uses approximately -4 semitones and a 0.84 formant scale. These are test defaults, not validated production anonymization guarantees.

The transformation configuration must be versioned so a submitted record can identify the exact processing version used.

Formal upload and storage rule:

- Raw microphone audio must remain on the participant's device.
- Raw audio must never be uploaded to the server, R2, D1, logs, analytics, or error-reporting services.
- Voice transformation must occur locally in the browser before upload.
- Only transformed audio may be stored in R2.
- Participant recordings, whether raw or transformed, must never be used to train AI models.
- D1 stores permitted participant fields, task/submission metadata, object references, timestamps, status, and transformation version; it does not store audio blobs.
- Avoid putting participant responses or identifying values in URLs, filenames, logs, or client-visible error traces.
- If transformation fails, block submission and clearly tell the participant that no raw recording was uploaded.
- Do not render the submission UUID on the completion screen or include it in completion-proof images. Returning a UUID screenshot through an identified channel could link a person to their research record.
- Completion-proof images are generated locally and contain no UUID, timestamp, profile data, or response data.

Treat this as a core system invariant, not optional UI wording.

## Interface and port mapping

| Actor or interface | Operating medium | Responsibility |
| --- | --- | --- |
| Participant | Mobile or desktop web browser | Consent, background form, stimulus playback, microphone recording, local transformation, submission |
| Researcher in MVP | Configuration files and Cloudflare management tools | Supply tasks/stimuli and inspect stored data; no custom dashboard yet |
| Researcher in later phase | Authenticated web dashboard | Study/task management, submission monitoring, export, and controlled audio access |
| Developer | Local editor, terminal, Git, browser developer tools | Build, test, configure, and deploy the system |
| Public frontend | Cloudflare Pages | Serve the participant HTML/CSS/JavaScript application |
| Application API | Cloudflare Workers HTTPS endpoints | Validate requests, create submission records, issue controlled upload operations, and finalize submissions |
| Metadata storage | Cloudflare D1 | Store structured, non-audio research metadata |
| Audio storage | Cloudflare R2 | Store transformed audio only |
| Optional introduction | Google Sites | Explain the study and link participants to the Pages application |

Logical request mapping:

```text
Participant browser
  -> Cloudflare Pages participant UI
  -> local microphone capture
  -> local PROFILE_A v2 transformation
  -> Worker API
       -> D1 metadata
       -> R2 transformed audio
```

Do not assign fixed localhost or network port numbers unless the selected implementation requires them. Document actual development ports when tooling is introduced.

## API and storage expectations

The exact endpoint names are not yet confirmed. A reasonable implementation may use a sequence equivalent to:

1. Create an anonymous submission/session.
2. Upload or authorize upload of one transformed task recording.
3. Record task completion metadata.
4. Finalize the submission.

Server-side validation must enforce the allowed fields, known `task_id` values, content type, object size limits, transformation version, and submission state. Client-side checks are for usability and are not a security boundary.

Use anonymous random identifiers. Do not derive IDs from personal data or use sequential public participant identifiers.

## Product behavior still requiring later confirmation

Do not silently turn these into permanent rules:

- exact task count for the production study
- maximum recording duration and file-size limit
- exact `PROFILE_A` transformation parameters and algorithm
- whether participants can re-record a response and how many attempts are allowed
- consent text, withdrawal process, retention period, deletion policy, and ethics/IRB wording
- supported browsers and minimum iOS/Safari versions
- final study configuration format and researcher authentication design
- export format and full researcher-dashboard requirements

For the test MVP, choose conservative, clearly configurable defaults and document them.

## Implementation guidance

- Optimize first for a reliable mobile-browser participant flow.
- Keep study content and task definitions configurable rather than embedding them throughout UI code.
- Support MP3 and WAV stimuli, but choose one normalized transformed-output format based on actual browser compatibility tests.
- Make recording, processing, uploading, success, and retry states visible and unambiguous.
- Do not claim that voice transformation guarantees irreversible anonymity. Use careful language such as risk reduction or de-identification, pending research and ethics review.
- Preserve the separation between public study content, sensitive submission metadata, and audio objects.
- Add tests around the raw-audio-never-uploaded invariant and contradictory playback policies.

## Development status

As of 2026-10-07, the test MVP is implemented. The repository contains the participant web flow, local `PROFILE_A` processing, a Worker API for D1/R2, and a dependency-free local test server. The production Cloudflare resources have not been provisioned or deployed. Before expanding beyond the MVP, confirm the relevant unresolved items with the user.
