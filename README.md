# Anonymous Speech Research Platform

匿名語音研究平台 MVP。受試者可選擇平台語言，完成同意、背景資料、設備測試、問題播放、錄音、本機聲音轉換及匿名提交。

## Privacy invariant

Raw microphone recordings stay in browser memory. Only a locally transformed `audio/wav` object is passed to the upload client. The Worker validates the transformed-audio headers before writing to R2; D1 stores metadata only.

`PROFILE_A` is a test profile, not a guarantee of irreversible anonymity. Its production algorithm and parameters require research and ethics review.

## Run locally

Requirement: Node.js 20 or newer. The included demo stimuli are short cue tones generated locally for workflow testing; replace them with approved speech stimuli for research use.

```powershell
npm run generate:audio
npm test
npm run dev
```

Open `http://127.0.0.1:8788`. Microphone access works on localhost. The local server stores only transformed test WAV files and metadata under ignored `local-data/`.

## Replace study content

Edit `public/study-config.js`. Each task contains:

- `task_id`
- `title`
- `prompt_text`
- `audio_stimulus` (MP3 or WAV URL)
- `research_instructions`
- `play_once`
- `replay_allowed`
- `max_playbacks` (current rule: 2)
- `max_recordings` (current rule: 2)

The two playback booleans must be logical opposites. Replace files in `public/assets/` with approved research question audio before deployment.

The opening language selector uses the Google Translate website element. It requires internet access and sends page text to Google's translation service; Traditional Chinese remains usable when the service cannot load. Include this external service in participant disclosure and privacy review before production use.

## Cloudflare setup

1. Create a D1 database named `anonymous-speech-metadata`.
2. Create a private R2 bucket named `anonymous-speech-audio`.
3. Replace `REPLACE_WITH_D1_DATABASE_ID` in `wrangler.toml`.
4. Apply `worker/schema.sql` to the D1 database.
5. Set `FRONTEND_ORIGIN` to the final Cloudflare Pages origin.
6. Deploy `worker/src/index.js` with its D1 binding `DB` and R2 binding `AUDIO`.
7. Deploy the `public/` directory to Cloudflare Pages.
8. Route `/api/*` to the Worker on the same site, or configure a Worker custom domain and update frontend API routing before launch.

Typical Wrangler commands after installing Wrangler are:

```powershell
npx wrangler d1 execute anonymous-speech-metadata --remote --file=worker/schema.sql
npx wrangler deploy
```

Cloudflare account IDs and production resource IDs are intentionally not committed.

## Project layout

```text
public/                  Participant web application
worker/src/              Cloudflare Worker API and validation
worker/schema.sql        D1 schema
scripts/dev-server.mjs   Dependency-free local server and storage mock
tests/                   Node built-in tests
wrangler.toml            Cloudflare bindings template
```

## MVP boundaries

This version does not include the researcher dashboard, authentication, exports, production consent wording, retention/deletion policy, or final voice de-identification validation. See `AGENTS.md` for confirmed decisions and unresolved items.

