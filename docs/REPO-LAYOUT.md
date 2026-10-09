# 這個 repository 的結構

> 這份文件說明 **GitHub 上的檔案怎麼擺**，以及它們跟網站、App 的關係。
> 專案本身的建置方式請看 [BUILD.md](BUILD.md)。

## 目前狀態

```
Orbit/                        ← https://github.com/SanYe0Cooki/Orbit
├── web/                      ★ 網站與 App 的原始碼（唯一需要手改的地方）
│   ├── app.html              App 主畫面
│   ├── app.js                全部邏輯
│   ├── sw.js                 Service Worker（離線）
│   ├── index.html            入口，導向 app.html
│   ├── privacy.html          隱私政策（上架必備）
│   ├── manifest.webmanifest  PWA 設定
│   ├── orbit-icon.svg
│   ├── icons/                PWA 圖示
│   └── vendor/supabase.js    本地化的 Supabase 客戶端
├── android/                  Android 原生專案（Gradle）
├── ios/                      iOS 原生專案（Xcode）
├── assets/                   圖示與啟動畫面來源 + 產生腳本
├── scripts/                  建置、驗證、測試、推送腳本
├── supabase/                 schema 與 migration
├── tests/                    無頭瀏覽器 UI 測試
├── docs/                     文件
├── store/                    Google Play 商店圖示
├── legacy/                   舊版網站的檔案（保留備查，不會被部署）
├── capacitor.config.json
└── .github/workflows/        android.yml · ios.yml · pages.yml
```

## 網站是怎麼發布的

只有 `.github/workflows/pages.yml` 負責部署，它把 **`web/` 的內容當成網站根目錄**。
因此網址是：

| 用途 | 網址 |
| --- | --- |
| 首頁 | https://sanye0cooki.github.io/Orbit/ |
| **App（Supabase Site URL 要填這個）** | https://sanye0cooki.github.io/Orbit/app.html |
| 隱私政策 | https://sanye0cooki.github.io/Orbit/privacy.html |

**為什麼 `app.html` 一定要在那個路徑？**
Supabase 的「Site URL」與驗證信、密碼重設信裡的連結都指向它。
路徑一旦改變，使用者點信裡的連結就會 404。

> ⚠️ repo 從 `wellnest` 改名成 `Orbit` 之後，舊網址
> `https://sanye0cooki.github.io/wellnest/` 已經 404。
> 請到 Supabase → Authentication → URL Configuration，
> 把 Site URL 與 Redirect URLs 裡的 `wellnest` 都改成 `Orbit`。

## `legacy/` 是什麼

原本這個 repo 的根目錄放的是舊版網站（`app.html`、`index.html`、
`manifest.webmanifest`、`orbit-icon.svg`、`README.md`、`docs/`、`supabase/`）。
新版把程式碼整理進 `web/`，舊檔沒有刪除，而是原封不動搬到 `legacy/`：

| 舊檔案 | 現在位置 |
| --- | --- |
| `app.html`、`index.html`、`manifest.webmanifest`、`orbit-icon.svg` | `legacy/` |
| `README.md` | `legacy/README.md`（新的說明在專案根目錄） |
| `docs/PRD.md`、`ARCHITECTURE.md`、`QA-TEST-PLAN.md` | `legacy/docs/`（新版同名文件在 `docs/`） |
| `supabase/schema.sql` | `legacy/supabase/schema.sql`（新版在 `supabase/migrations/001_orbit_initial_schema.sql`） |

`legacy/` 不會被部署，也不被 App 打包，純粹是為了讓你能對照舊版。
確認不需要之後，整個資料夾可以直接刪掉。

## 舊的 Pages 流程已經移除

原本 `.github/workflows/` 裡有 **兩個** 都在部署整個 repo 的流程
（`deploy-pages.yml` 與 `static.yml`），彼此競爭、也會把 `android/`、`ios/`
之類不需要的檔案一起發布。它們已被移除，改由 `pages.yml` 單獨負責。

## 相關文件

| 文件 | 內容 |
| --- | --- |
| [../README.md](../README.md) | 專案總覽、功能、開發指令 |
| [BUILD.md](BUILD.md) | 打包成 App、簽章、改版、Pages 部署 |
| [SUPABASE-SETUP.md](SUPABASE-SETUP.md) | 讓任意 Email 都能註冊、SMTP、Redirect URL |
| [APP-STORE-CHECKLIST.md](APP-STORE-CHECKLIST.md) | 上架 App Store / Google Play 逐項清單 |
