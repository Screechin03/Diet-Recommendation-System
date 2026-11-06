# MamaCare — mobile app (Android + iOS)

Expo / React Native version of the Pregnancy Nutrition web app. One TypeScript codebase builds both the
Android and iOS apps, and **EAS** builds and publishes them in the cloud (no Android Studio/Xcode needed).

## How it fits together

```
 ┌──────────────┐   HTTPS /api/*   ┌──────────────────────┐   HTTP   ┌─────────────────────┐
 │  Mobile app  │ ───────────────▶ │ Next.js web app      │ ───────▶ │ FastAPI ML backend  │
 │ (this folder)│                  │ (nextjs-frontend/)   │          │ (FastAPI_Backend/)  │
 └──────┬───────┘                  │ holds GEMINI_API_KEY │          │ KNN recipes, RF risk│
        │                          └──────────┬───────────┘          │ model, Gemini OCR   │
        │ auth + saved/history                │ Gemini API           └─────────────────────┘
        ▼                                     ▼
   Supabase (same project/tables as the website)
```

The app **reuses the existing backend unchanged**. It calls the same Next.js `/api/*` routes as the website,
so the Gemini key stays on the server and the ingredient-correction and diet-filter logic is shared.

## Screen → API → backend map

| App screen | Calls | Next.js route does | FastAPI / service |
|---|---|---|---|
| **Diet Plan** tab (web *Diet Planner* + *Recipe Finder*) | `POST /api/predict` | Gemini typo fix + restriction substitutions, retries, post-filters by diet | `POST /predict/` → BMR/trimester calorie targets → ingredient + diet filter → KNN (cosine) over 9 nutrients |
| ↳ AI summary toggle | `POST /api/refine` `{kind:"recipes"}` | Gemini rewrites results in plain language | — |
| ↳ recipe photos | `GET /api/recipe_image` | TheMealDB / Wikimedia / Gemini image lookup | — |
| ↳ Save / history | Supabase `saved_recipes`, `recipe_history` | — | Supabase (RLS: own rows only) |
| **Health** tab (web *Health Analytics*) | `POST /api/predict_pregnancy_risk` | plain proxy | `POST /predict_pregnancy_risk` → RandomForest on `health_data.csv` + rule-based recommendations |
| ↳ AI summary toggle | `POST /api/refine` `{kind:"risk"}` | Gemini explanation | — |
| **Reports** tab → *Full report* (web *Prescription Reader*) | `POST /api/prescription_report` (multipart) | proxy, 110 s timeout | `POST /prescription_report` → block-letter handwriting scan + Gemini vision extraction → Gemini diet plan. If Gemini is unavailable, the scan is still returned |
| **Reports** tab → *Handwriting scan* | `POST /api/ocr_handwriting` (multipart) | proxy, 30 s timeout | `POST /ocr/handwriting` → h_recog character model (ONNX). No AI key needed; see `FastAPI_Backend/ocr/README.md` |
| **Account** tab, Login, Sign up, Saved, History | Supabase Auth + tables | — | same accounts as the website |

Left out of the app on purpose: the web `/features` and `/docs` pages (marketing/API docs), `/todos` (Supabase demo),
`/model_performance` and `/batch_risk_assessment` (developer/clinic tools).

## Code layout

```
src/app/                 screens (Expo Router: each file is a route)
  _layout.tsx            root stack + AuthProvider
  (tabs)/_layout.tsx     bottom tabs
  (tabs)/index.tsx       Home
  (tabs)/planner.tsx     Diet Plan (profile is remembered on device)
  (tabs)/health.tsx      Health risk check
  (tabs)/report.tsx      Prescription reader + handwriting scan (camera / photos / PDF)
  (tabs)/account.tsx     Account
  login.tsx signup.tsx saved.tsx history.tsx
src/lib/api.ts           every backend call in one place
src/lib/supabase.ts      Supabase client (session persisted on device)
src/lib/userData.ts      saved recipes + history queries
src/lib/types.ts         request/response types (shared with the web app)
src/lib/report.ts        report/scan response parsing (shared with nextjs-frontend/src/lib/report.ts)
src/components/          UI kit, RecipeCard, AI summary, ReportViews (report, diet plan, scan cards)
```

## Run it on your phone (development)

```bash
cd mobile-app
cp .env.example .env      # fill in the 3 values
npm install
npx expo start            # scan the QR code with the Expo Go app (Android/iOS)
```

`EXPO_PUBLIC_API_URL` must be reachable **from the phone**:
- Deployed web app: `https://your-app.vercel.app`
- Local web app: run `npm run dev` in `nextjs-frontend/`, run FastAPI on 8080, then use your computer's LAN IP,
  for example `http://192.168.1.20:3000`. `localhost` does not work, because on the phone it means the phone itself.

## Build and publish

One-time setup: `npm i -g eas-cli` (or use `npx eas-cli@latest`), then `eas login` and `eas init`.

Set the same three env vars for cloud builds, either in the expo.dev dashboard (Project → Environment variables)
or with `eas env:create`.

| Goal | Command | Result |
|---|---|---|
| Installable Android APK to share for testing | `npm run build:android` | download link / QR for an `.apk` |
| Store builds (Android `.aab` + iOS `.ipa`) | `npm run build:prod` | signed store builds, version auto-incremented |
| Publish to Play Store / App Store | `npx eas-cli@latest submit -p android` / `-p ios` | uploads the latest build |
| Ship a JS-only fix without a store review | `npx eas-cli@latest update` | over-the-air update |

Store accounts needed: Google Play Console (one-time $25) and Apple Developer Program ($99/year, for iOS only).
Before publishing, change `android.package` / `ios.bundleIdentifier` in `app.json` (currently `com.mamacare.app`)
to an ID you own, and replace the icons in `assets/`.

## Checks

```bash
npm run typecheck
npx expo-doctor
```
