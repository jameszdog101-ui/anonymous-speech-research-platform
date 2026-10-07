# 匿名語音研究平台：正式部署、資料庫與研究人員端建置企劃書

版本：提案 v1.0  
日期：2026-10-07  
狀態：2026-10-07 已確認，開始執行

## 已確認決策

- 正式發布採 GitHub 連接 Cloudflare Pages；另建 GitHub Pages 無資料庫展示版。
- Cloudflare 帳號尚未建立，正式資源部署需待帳號完成後進行。
- 第一位核准研究人員為專案負責人指定的 Gmail 帳號；實際地址以 Cloudflare 環境變數設定，不提交至 Git。
- 第一版只有 `researcher` 角色。
- 資格審核採 `符合／不符合／無法判定`。
- 研究人員可下載去識別化音檔，所有下載均寫入稽核紀錄。
- 希望資料儘可能長期保存，但確切期限仍須依研究地區、倫理審查、同意書與撤回規則確認；系統先保留可設定期限，不宣稱永久保存。

## 一、計畫目標

將目前已完成的測試版轉為可持續部署的研究系統，並開始建置安全的資料庫與研究人員操作介面。

本階段包含三項成果：

1. 以 GitHub 儲存及管理程式碼，透過 GitHub 更新自動部署公開網站。
2. 以 Cloudflare Workers、D1、R2 建立正式資料接收與儲存環境。
3. 建立只有授權實驗人員可以使用的第一版研究人員端。

## 二、建議部署架構

```text
GitHub repository
  -> main branch
  -> Cloudflare Pages 自動部署受試者網站

受試者瀏覽器
  -> Cloudflare Pages 公開介面
  -> 瀏覽器內 PROFILE_A v2.0.1 去識別化
  -> Cloudflare Worker API
       -> D1：背景資料、任務狀態、音檔索引、稽核資料
       -> R2：只保存去識別化後的 WAV

研究人員瀏覽器
  -> Cloudflare Access 登入保護
  -> 研究人員介面
  -> 管理專用 Worker API
       -> 查詢 D1
       -> 受控讀取 R2
       -> 匯出研究資料
```

### GitHub 的定位

- GitHub 保存 HTML、CSS、JavaScript、Worker 程式、資料庫 migration 與測試。
- GitHub 不保存受試者背景資料、錄音、匯出檔或正式密鑰。
- 建議由 GitHub 連接 Cloudflare Pages，而不是直接以 GitHub Pages 作為正式研究網站。
- 原因是目前系統需要 Worker、D1、R2、同源 API 與存取控制；GitHub Pages 只能提供靜態檔案。
- 如需展示版，可另外建立不連接正式資料庫的 GitHub Pages demo。

## 三、公開受試者端部署

### 部署項目

- GitHub `main` 分支作為正式版本來源。
- Pull request 或測試分支建立預覽部署。
- `main` 通過測試後自動更新正式 Cloudflare Pages 網站。
- 正式站使用 HTTPS、自訂網域或 Cloudflare Pages 網域。
- `/api/*` 與前端維持同源，降低 CORS 與設定錯誤風險。
- 正式環境與測試環境使用不同的 D1、R2 與環境變數。

### 上線前阻擋條件

- 正式題目與刺激音檔已核准。
- 同意書、退出方式、保存期限及刪除政策已確認。
- Google Translate 的外部資料傳送已納入告知與審查。
- PROFILE_A 已完成足以支撐研究用途的效果檢驗；介面不得宣稱絕對匿名。
- 行動裝置與目標瀏覽器已完成錄音、轉檔與上傳測試。

## 四、資料庫與檔案儲存

### D1 儲存範圍

現有資料表將以 migration 管理，保留：

- 匿名 submission ID
- 研究與版本編號
- 完成狀態
- 允許收集的背景欄位
- 每題錄音的 R2 object key
- 音檔大小
- 去識別化 profile、版本與參數
- 建立、上傳與完成時間

建議新增：

- `studies`：研究版本、啟用狀態及顯示名稱
- `study_tasks`：任務設定、順序與刺激檔版本
- `researcher_audit_log`：研究人員查詢、播放、下載、匯出與刪除事件
- `exports`：匯出工作狀態、範圍與到期時間
- `submission_reviews`：資格錄音審核結果與備註

### R2 儲存規則

- Bucket 保持 private。
- 只接受經 Worker 驗證的去識別化 WAV。
- 原始麥克風錄音不得上傳。
- 研究人員不可取得永久公開音檔網址。
- 播放或下載必須經授權 API 產生短效存取。
- 物件名稱不得包含姓名、email、國籍或其他個人欄位。

### 資料生命週期

- 正式建置前需決定保存期限。
- 到期刪除必須同時清除 D1 metadata 與 R2 音檔。
- 刪除操作寫入稽核紀錄，但稽核紀錄不可保存音檔內容。
- 備份、匯出檔與暫存檔必須遵循相同期限。

## 五、研究人員端 MVP

### 身分驗證與權限

- 使用 Cloudflare Access 保護整個研究人員端。
- 第一版採單一角色 `researcher`，只有核准帳號可進入。
- Worker 必須驗證 Access 身分，不可信任前端隱藏按鈕。
- 後續如有需要再拆分 `viewer`、`reviewer`、`administrator`。

### 第一版功能

1. 總覽
   - 已完成、進行中及異常提交數量
   - 各任務成功上傳數量
   - 最近提交狀態

2. 提交清單
   - 以匿名 ID、狀態、研究版本、建立日期篩選
   - 顯示允許的背景欄位
   - 不顯示或建立姓名、電話、私人 email 等欄位

3. 第一語言資格審核
   - 播放 `eligibility_001` 去識別化錄音
   - 標記 `符合`、`不符合`、`無法判定`
   - 備註欄只記錄研究判定，不輸入猜測的身分資訊

4. 任務錄音檢視
   - 顯示 task ID、轉換版本、檔案大小與上傳時間
   - 受控播放去識別化錄音
   - 清楚標示目前播放的是去識別化版本

5. 匯出
   - 匯出 CSV metadata
   - 音檔以匿名 ID 與 task ID 對應
   - 匯出動作留下稽核紀錄

### 暫不納入第一版

- 線上編輯正式題目
- 多研究、多機構權限管理
- 自動判定母語或國籍
- AI 轉錄、AI 分類或模型訓練
- 未經確認的批次刪除功能

## 六、API 規劃

### 公開受試者 API

- `POST /api/submissions`
- `PUT /api/submissions/:id/tasks/:taskId/audio`
- `POST /api/submissions/:id/finalize`
- `GET /api/health`

維持既有 raw-audio-never-uploaded 驗證，並加入速率限制、請求大小限制及一致的安全回應。

### 研究人員 API

- `GET /admin/api/summary`
- `GET /admin/api/submissions`
- `GET /admin/api/submissions/:id`
- `GET /admin/api/submissions/:id/tasks/:taskId/audio`
- `PUT /admin/api/submissions/:id/review`
- `POST /admin/api/exports`

所有管理 API 必須通過 Cloudflare Access 驗證並寫入 audit log。

## 七、安全與研究倫理原則

- 不從錄音推斷國籍；資格審核只判斷是否符合自填第一語言及錄音品質要求。
- 不使用任何錄音訓練 AI。
- 去識別化是降低聲紋辨識風險，不宣稱不可逆或保證匿名。
- 公開 API 與管理 API 分離。
- 正式密鑰只存在 Cloudflare secret／環境設定，不進 Git。
- 錯誤訊息與伺服器 log 不記錄背景答案或音檔內容。
- 下載、播放、匯出及刪除均需稽核。

## 八、執行階段

### 階段 1：GitHub 與部署管線

- 建立部署設定與環境分流。
- GitHub push 觸發測試及 Cloudflare Pages 預覽／正式部署。
- 建立 production、preview 的設定文件。
- 驗收：公開網址可完成靜態載入，測試分支不會寫入正式資料庫。

### 階段 2：Cloudflare 正式資料層

- 建立 D1、R2 與 Worker bindings。
- 將 schema 改為可追蹤 migrations。
- 部署 API 並測試完整三段錄音提交。
- 驗收：D1 只有 metadata，R2 只有去識別化 WAV。

### 階段 3：研究人員端基礎與登入

- 建立 `/admin/` 介面。
- 設定 Cloudflare Access。
- 建立管理 API 與 audit log。
- 驗收：未授權使用者無法讀取清單或音檔。

### 階段 4：審核、播放與匯出

- 建立提交清單、篩選、資格審核與音檔播放。
- 建立 CSV metadata 匯出與匿名音檔對應。
- 驗收：所有敏感操作可在 audit log 查到。

### 階段 5：整合驗收

- 桌面與手機實測。
- 權限、資料隔離、錯誤恢復與上傳中斷測試。
- 檢查前端 bundle、Git history、logs 及公開路徑均無研究資料。
- 產出部署與操作文件。

## 九、驗收標準

- GitHub 更新可自動產生預覽並部署核准版本。
- 未登入者不能存取研究人員頁面、D1 查詢或 R2 音檔。
- 原始錄音不會出現在任何網路請求、D1、R2、log 或錯誤追蹤中。
- 每筆完成提交包含 `eligibility_001` 與所有正式任務。
- 研究人員可審核第一語言錄音、播放去識別化音檔並匯出 metadata。
- 完成證明不含 submission UUID 或背景資料。
- 自動測試涵蓋公開 API、管理權限、音檔格式、任務完整性與稽核。

## 十、開始前需要確認

1. 正式公開網站採「GitHub 連接 Cloudflare Pages」；是否仍需要額外 GitHub Pages demo？
2. Cloudflare 帳號、網站網域，以及 D1／R2 是否由同一帳號管理？
3. 哪些 email 可以登入研究人員端？
4. 第一版是否只有一種 `researcher` 權限？
5. 第一語言資格審核結果是否採 `符合／不符合／無法判定`？
6. 研究資料保存期限及刪除規則為何？
7. 研究人員是否允許下載音檔，或第一版只允許站內播放？
8. CSV 需要包含哪些背景欄位與審核欄位？

## 十一、建議決策

- 正式站：GitHub + Cloudflare Pages 自動部署。
- 資料層：Cloudflare Worker + D1 + private R2。
- 後台登入：Cloudflare Access email allowlist。
- 第一版權限：單一 `researcher`。
- 音檔：第一版先站內播放；確認管理規則後才提供下載。
- 資格結果：`符合／不符合／無法判定`，不建立國籍推斷欄位。
- 正式部署前先完成測試環境，再由測試環境提升到 production。

