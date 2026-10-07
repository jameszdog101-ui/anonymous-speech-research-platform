# Cloudflare 正式環境建置計畫書

版本：v1.0  
日期：2026-10-07  
狀態：待 Cloudflare 帳號開通後執行

## 一、建置目標

將目前 GitHub Pages 展示版升級為可實際接收研究資料的 Cloudflare 測試環境，完成驗收後再提升為正式環境。

Cloudflare 將負責：

- Pages：受試者網站與研究人員端靜態介面
- Workers：公開提交 API 與受保護的研究人員 API
- D1：背景資料、提交狀態、審核結果及稽核紀錄
- R2：只保存去識別化後的 WAV
- Zero Trust Access：限制研究人員端及管理 API

GitHub 繼續負責程式碼、版本、測試與部署來源。GitHub 不保存正式研究資料。

## 二、你需要申請或授權的項目

### 1. Cloudflare 帳號：必要

申請位置：https://dash.cloudflare.com/sign-up

建議：

- 使用你可長期控制的 email 建立帳號。
- 完成 email 驗證。
- 立即啟用兩步驟驗證（2FA）。
- 不要把密碼、驗證碼或備援碼交給開發人員或寫入 GitHub。

Pages、Workers、D1、R2 與 Zero Trust 均使用這個 Cloudflare 帳號，不需分別註冊。

### 2. GitHub 授權：必要

建立 Pages 專案時，Cloudflare 會要求安裝或授權 Cloudflare GitHub App。

只授權這個 repository：

```text
jameszdog101-ui/anonymous-speech-research-platform
```

不要選擇「All repositories」，以縮小權限範圍。

### 3. R2 訂閱：必要

位置：Cloudflare Dashboard → Storage & databases → R2 → Overview

R2 有免費用量額度，但開通時需完成 subscription checkout；超過免費額度後按使用量計費。帳號可能要求付款方式。建議先設定帳務警示並定期查看用量。

### 4. Cloudflare Zero Trust Free：必要

位置：Cloudflare Dashboard → Zero Trust

建議 team name：

```text
anonymous-speech-research
```

選擇 Zero Trust Free。官方流程目前仍可能要求付款資料，但選擇免費方案不會直接收取訂閱費。登入方式先使用 email one-time PIN，允許的研究人員 email 由 Access policy 管理。

### 5. 自訂網域：正式上線前建議，測試階段非必要

測試期可先使用：

```text
anonymous-speech-research-platform.pages.dev
```

正式研究建議購買專用網域，範例：

```text
anonymous-speech-research.org
speech-research-platform.org
```

網域可向 Cloudflare Registrar 或其他註冊商購買。購買網域會產生年度費用，應等名稱、研究單位與管理責任確認後再進行。

## 三、不需要另外申請的項目

- 不需要新的 GitHub 帳號。
- 不需要獨立申請 D1 帳號。
- 不需要獨立申請 Workers 帳號。
- 不需要獨立申請 Pages 帳號。
- 不需要 AWS S3 帳號；本案使用 Cloudflare R2。
- 測試階段不需要先購買網域。

## 四、預定資源名稱

### 測試環境

```text
Pages: anonymous-speech-research-platform-staging
Worker: anonymous-speech-platform-api-staging
D1: anonymous-speech-metadata-staging
R2: anonymous-speech-audio-staging
Access app: anonymous-speech-research-admin-staging
```

### 正式環境

```text
Pages: anonymous-speech-research-platform
Worker: anonymous-speech-platform-api
D1: anonymous-speech-metadata-production
R2: anonymous-speech-audio-production
Access app: anonymous-speech-research-admin
```

測試與正式環境不得共用 D1 或 R2。

## 五、部署架構

```text
GitHub main
  -> Cloudflare Pages production deployment

GitHub non-main branch / pull request
  -> Cloudflare Pages preview deployment

Participant browser
  -> Pages participant UI
  -> local PROFILE_A v2.0.1 transformation
  -> Worker public API
  -> D1 metadata + private R2 transformed WAV

Researcher browser
  -> /admin/
  -> Cloudflare Access email OTP
  -> Worker admin API
  -> D1 review data + controlled R2 playback/download
```

## 六、執行階段與分工

### 階段 1：帳號與安全設定

你需要完成：

1. 建立 Cloudflare 帳號。
2. 驗證 email。
3. 啟用 2FA 並保存備援碼。
4. 選擇 Zero Trust Free 並建立 team name。
5. 開通 R2 subscription。

我可以在你登入後協助檢查設定，但密碼、OTP、付款資料及 2FA 備援碼必須由你本人保管與輸入。

### 階段 2：GitHub 與 Pages 測試部署

你需要完成：

1. 在 Cloudflare 的 GitHub 授權畫面核准指定 repository。

我負責：

1. 建立 staging Pages project。
2. 設定 production branch 為 `main`。
3. 設定靜態輸出目錄為 `public`。
4. 驗證 preview 與 production URL。
5. 確認 GitHub push 可自動部署。

### 階段 3：D1 與 R2 測試資源

我負責：

1. 建立 staging D1。
2. 將現有 schema 轉為版本化 migrations。
3. 套用 submissions、task recordings、reviews 與 audit log schema。
4. 建立 private staging R2 bucket。
5. 建立 Worker 的 `DB` 與 `AUDIO` bindings。
6. 驗證 D1 不含 audio blob，R2 不含 raw audio。

### 階段 4：Worker API

我負責：

1. 部署 staging Worker。
2. 設定 `FRONTEND_ORIGIN`。
3. 設定 `RESEARCHER_EMAILS`，第一位為已確認的 Gmail 帳號。
4. 測試建立 submission、三段轉換錄音上傳與 finalize。
5. 測試格式、大小、任務 ID、轉換版本與狀態驗證。
6. 加入速率限制與基本濫用防護。

### 階段 5：研究人員 Access

我負責建立：

- Access application
- email one-time PIN 登入
- 單一 `researcher` 權限
- 只允許核准 email
- 管理 API 身分檢查與 audit log

你需要親自完成：

- 第一次 email OTP 登入測試
- 確認帳號確實能收到登入碼

### 階段 6：測試環境驗收

驗收項目：

- 手機與桌面錄音
- MP3/WAV 問題播放
- PROFILE_A v2.0.1 本機轉換
- 原始錄音不進入網路請求
- 資格錄音及正式錄音均只上傳轉換版本
- 研究人員登入、播放、下載、審核與 CSV 匯出
- 未授權 email 無法取得管理資料
- 下載及審核操作出現在 audit log
- 中斷、重試、重複提交與錯誤回應

### 階段 7：正式環境

完成倫理與研究規則確認後：

1. 建立獨立 production D1 與 R2。
2. 套用 migrations。
3. 部署 production Worker 與 Pages。
4. 設定正式 Access policy。
5. 如已購買網域，設定 custom domain 與 HTTPS。
6. 將 `pages.dev` 導向正式網域。
7. 進行最後一次空資料驗收後才開放招募。

## 七、資料保存與費用控制

目前「儘可能長期保存」仍不是可直接寫入同意書的正式期限。正式上線前必須確認：

- 保存年限或終止條件
- 參與者撤回及刪除流程
- 研究結束後由誰負責資料
- 帳號停用、付款中斷或研究人員離職時的移交方式
- D1、R2、匯出檔與備份是否使用相同期限

在規則確認前：

- 不設定自動永久保存承諾。
- 不啟用自動刪除。
- 不把正式研究資料存入 staging。
- 先設定 R2 使用量監控與帳務警示。

## 八、帳號安全與權限原則

- Cloudflare 帳號啟用 2FA。
- GitHub App 只允許指定 repository。
- R2 bucket 必須保持 private。
- 不建立公開 R2 URL。
- 不把 Cloudflare API token、account ID、database ID 或真實 allowlist 寫入公開 GitHub。
- 正式 secret 使用 Cloudflare secrets 或 dashboard variables。
- 初期只有一個 Cloudflare account owner；正式研究前應確認第二位緊急管理者或移交程序。
- 研究人員日常只登入 `/admin/`，不共用 Cloudflare 主帳號。

## 九、你完成申請後需要提供的資訊

只需回覆下列非敏感狀態，不要提供密碼或驗證碼：

```text
Cloudflare 帳號：已建立 / 尚未
Email 驗證：已完成 / 尚未
2FA：已啟用 / 尚未
Zero Trust Free：已開通 / 尚未
Zero Trust team name：________
R2 subscription：已開通 / 尚未
GitHub repository 授權：已完成 / 尚未
自訂網域：暫不購買 / 已有網域 ________
```

完成上述必要項目後，即可開始 staging 環境部署。
