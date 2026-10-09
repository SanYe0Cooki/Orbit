# Orbit

**Small habits. Better days.** — 一天一點點，把想做的事變成習慣。

Orbit 是一款簡潔現代風格的生活習慣追蹤 App。這個 repository 同時包含：

1. **網頁版**（`web/`）— 純靜態 HTML/CSS/JS，可部署到 GitHub Pages。
2. **iOS App**（`ios/`）與 **Android App**（`android/`）— 用 Capacitor 把同一份
   `web/` 包成原生 App，可在 GitHub Actions 雲端打包（不需要 Mac）。

| | |
| --- | --- |
| 線上網頁版 | https://sanye0cooki.github.io/wellnest/app.html |
| Bundle ID | `com.orbit.habits`（上架前請改成你自己的） |
| 後端 | Supabase Auth + PostgreSQL（已啟用 RLS） |
| 語言 | 繁體中文 / English，可即時切換 |
| 外觀 | 淺色 / 深色 / 跟隨系統 |

---

## 快速開始

```bash
# 1. 安裝依賴
npm install

# 2. 本機預覽網頁版（一定要用 http，不要用 file://）
node scripts/serve.mjs
# → http://localhost:4173/web/app.html

# 3. 檢查設定是否一致、有沒有漏改的預留值
node scripts/verify.mjs

# 4. 跑介面自動測試（需要先啟動上面的伺服器）
node scripts/run-smoke-test.mjs

# 5. 同步 web/ 到原生專案
npx cap sync

# 6. 雲端打包：推上 GitHub 後到 Actions 分頁下載 APK / IPA
```

詳細步驟見 **[docs/BUILD.md](docs/BUILD.md)**。

---

## 功能

**習慣管理**
- 新增 / 編輯 / 暫停 / 封存 / 刪除習慣
- 每個習慣可設定**重複的日子**（例如只在週一到週五）與**一天幾次**
- 圖示挑選、提醒文字

**打卡與進度**
- 點一下打卡，達到目標次數再點一次可取消
- 今日完成環、連續天數（**休息日不會中斷連續紀錄**）
- 習慣若設定「一天幾次」，主畫面的數字會自動切換成「今日目標次數」，避免誤會
- 近七天長條圖、最穩定的習慣排行（28 天達成率）

**帳號與同步**
- 訪客模式：不需要帳號，資料只存在這台裝置
- 用**任意電子郵件**註冊／登入（Email + 密碼）
- 忘記密碼、App 內刪除帳號
- 離線可打卡，恢復連線後自動同步
- 匯出／匯入 JSON 備份

**行動裝置體驗**
- 底部四頁籤：今日、習慣、統計、我的
- 左右滑動切換頁面（輸入框與按鈕上的滑動不會被攔截）
- 深色模式、安全區域（瀏海／動態島／手勢列）適配
- 原生觸覺回饋、Android 實體返回鍵行為
- 尊重系統的「減少動態效果」設定

---

## 專案結構

```
orbit-app/
├── web/                     # App 本體（原生 App 載入的內容）
│   ├── app.html             # 主要畫面
│   ├── app.js               # 全部邏輯（狀態、同步、i18n）
│   ├── index.html           # 入口，導向 app.html
│   ├── privacy.html         # 隱私政策（上架必備，可公開網址）
│   ├── sw.js                # Service Worker，離線開啟
│   ├── manifest.webmanifest # PWA 設定
│   ├── orbit-icon.svg
│   ├── icons/               # PWA 用 PNG 圖示
│   └── vendor/supabase.js   # 本地化的 Supabase 客戶端（離線可用）
├── android/                 # Capacitor Android 原生專案
├── ios/                     # Capacitor iOS 原生專案
├── assets/                  # 圖示與啟動畫面來源 + make-icons.py
├── scripts/                 # 建置輔助腳本、驗證、UI 自動測試
├── supabase/                # schema 與 migration
├── tests/                   # 無頭瀏覽器 UI 測試與預覽頁
├── docs/                    # 文件
├── capacitor.config.json
└── .github/workflows/       # 雲端打包流程
```

---

## 開發指令

| 指令 | 用途 |
| --- | --- |
| `node scripts/serve.mjs` | 啟動本機靜態伺服器（含 `/web` 與 `/tests`） |
| `node scripts/verify.mjs` | 檢查 Bundle ID 一致性、圖示是否齊全、有無金鑰外洩 |
| `node scripts/run-smoke-test.mjs` | 用無頭 Chrome 跑 100+ 項介面自動測試 |
| `node scripts/install-assets.mjs` | 把圖示與啟動畫面裝進 Android / iOS 專案 |
| `python assets/make-icons.py` | 重新產生全套圖示 |
| `npx cap sync` | 把 `web/` 同步到原生專案 |

---

## 文件

| 文件 | 內容 |
| --- | --- |
| [docs/BUILD.md](docs/BUILD.md) | 如何打包成 App、簽章設定、改版流程 |
| [docs/SUPABASE-SETUP.md](docs/SUPABASE-SETUP.md) | 讓任意 Email 都能註冊、SMTP、Redirect URL |
| [docs/APP-STORE-CHECKLIST.md](docs/APP-STORE-CHECKLIST.md) | 上架 App Store / Google Play 的逐項清單 |
| [docs/PRD.md](docs/PRD.md) | 產品需求 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 技術架構 |
| [docs/QA-TEST-PLAN.md](docs/QA-TEST-PLAN.md) | 測試矩陣 |

---

## 隱私

Orbit 是一般生活習慣管理工具，**不是醫療服務**。訪客模式的資料不會離開裝置；
登入後資料儲存於 Supabase，並以 Row Level Security 確保每個使用者只能存取自己的資料。
詳見 [web/privacy.html](web/privacy.html)。
