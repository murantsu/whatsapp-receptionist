# P0-8 実装結果

- 実施日: 2026-08-19
- 対象branch: `agent/p0-8-release-gate`
- base: Phase 2最終commit `408dcf1`
- fork: `murantsu/whatsapp-receptionist`
- draft PR: [#3 P0-8: reproducible Node 22 release gate](https://github.com/murantsu/whatsapp-receptionist/pull/3)
- 検証Node.js: `v22.23.2`

## 結論

P0-8の範囲だけを実装しました。Windows production buildは、コンパイル、typecheck、94/94ページ生成、build trace収集、standalone出力、最終最適化まで完全成功し、既知の `EPERM: operation not permitted, mkdir 'C:\Users\Users'` は再発していません。

アプリ機能、画面、データベースmigrationは変更していません。実WhatsApp、実Google Calendar、実Anthropic、実Resendにも接続していません。P0-9には着手していません。

## 1. Windows production build

**完全成功しました。**

根本原因は、`next.config.ts` の `new URL('.', import.meta.url).pathname` でした。Windowsではこの値が `/C:/Users/...` となり、Next.jsのoutput file tracingが通常のWindowsファイルパスとして再解釈した結果、誤った親ディレクトリ `C:\Users\Users` を作成しようとしていました。

標準の `fileURLToPath()` を使い、file URLをOSに合ったファイルパスへ変換するよう修正しました。同じパターンだったVitestのaliasも同様に修正しました。一時的な権限変更やPC固有パスによる回避は使っていません。

## 2. GitHub Actions

**draft PR #3の最終headで全8 jobがgreenです。**

- Verify（typecheck + ESLint + 通常テスト + DB lint）
- Dependency audit（production + development）
- Secret scan（gitleaks）
- Windows release gate
- Supabase tenant isolation
- E2E（full Playwright）
- Production build（Linux）
- Test coverage

最初の実行では、GitHub runner上のPlaywrightブラウザー取得が20分間進まない外部ダウンロード停滞が1回あり、その実行だけを中止しました。コードまたはテストの失敗ではなく、最終headの新しい実行で全jobの成功を確認しています。

Actionsの全jobは `.nvmrc` をNode.jsバージョンの単一の基準として使用します。既存のfull Playwright jobから `continue-on-error` を外したため、E2E失敗もreleaseを止めます。さらに `windows-latest` で同じrelease gateを実行するjobを追加しました。

## 3. 全テスト結果

### Windows / Node.js 22.23.2

| Gate | 結果 |
| --- | --- |
| `npm ci` | 成功（455 packages、監査対象456 packages） |
| production dependency audit | 0 vulnerabilities |
| full dependency audit | 0 vulnerabilities |
| TypeScript typecheck | 成功 |
| ESLint | 成功（0 errors、既存warning 3件） |
| 通常テスト | 84 files、619/619成功 |
| RLS migration lint | 22 tables、成功 |
| tenant isolation DBテスト | 1 file、16/16成功 |
| production build | 成功（94/94 pages、standalone trace完了） |
| Playwright release smoke | 5/5成功 |

通常テストの内容や件数は変更していません。Windows/OneDriveで多数のroute importを同時実行すると既定5秒timeoutを超えたため、全OS共通で最大4 worker、120秒timeoutに統一しました。これによりI/O飽和を抑え、同じ619件が成功しています。

### Playwright smokeの対象

- 公開トップページが表示できる
- sign-in画面が英語で表示される
- 未認証状態でDashboardへ入れない
- 未認証状態でConversationsへ入れない
- 未認証状態でAppointments / Calendarへ入れない
- 未認証状態でKnowledge Baseへ入れない

## 4. 修正内容

1. Next.jsのoutput tracing rootをcross-platformなファイルパス変換へ修正
2. Unix専用の `rm -f tsconfig.tsbuildinfo` を小さなNode.js clean scriptへ置換
3. `.nvmrc` のNode 22を全Actions jobの共通基準に設定
4. production/full audit、verify、tenant DB、build、Playwright smokeを直列実行する `npm run release:gate` を追加
5. release gateがNode 22以外を検出して停止し、Windowsでnpmとpackage scriptのNodeが食い違う場合もnpmを起動したNode 22へ安全に揃えるようにした
6. release gateではダミー値だけを設定し、実外部サービスへ接続しないようにした
7. Windows GitHub Actions release gateを追加
8. 既存full Playwright Actions jobをblockingに変更
9. Windows/OneDriveで再現可能なVitest worker数とtimeoutへ統一

## 5. 変更した主要ファイル

- `.github/workflows/ci.yml`
- `next.config.ts`
- `package.json`
- `playwright.config.ts`
- `vitest.config.ts`
- `scripts/clean-typecheck.mjs`
- `scripts/release-gate.mjs`
- `e2e/release-smoke.spec.ts`

## 6. Phase 1・Phase 2への影響

- Phase 1のtenant A/B分離テストは16/16成功しています。
- Phase 2を含む通常テストは619/619成功しています。
- 英語AI受付、FAQ、safety escalation、human handoff、opt-out、英語予約作成・変更・取消、Google Calendar失敗時handoff、Auto Repair Shop受付、英語主要画面、MVP外機能の非表示を検証する既存テストは削除・skipしていません。
- アプリ本体、UI、migrationは変更していないため、実行時の機能仕様に変更はありません。

## 7. 未解決問題

- ESLintにはP0-8以前からのwarningが3件あります。errorは0件で、今回変更したファイルには新しいwarningはありません。
- Next.js buildには既存のTwitter image `runtime` 検出warningとedge runtime/static generation warningがあります。buildは最後まで成功しており、今回のWindows path問題とは無関係です。
- GitHub Actionsは `actions/checkout@v4` と `gitleaks/gitleaks-action@v2` の内部ランタイムについてNode 20非推奨warningを表示します。アプリの検証NodeはNode 22でありjobは成功しますが、各Actionの安定した次majorへ更新可能になった時点で別途追従できます。
- 実サービスを使うステージング受入試験は、指示どおりP0-9まで実施していません。

## 8. P0-9へ進める状態か

**技術的には進めて問題ない状態です。** P0-8のrelease gate、Windows build、Linux build、full E2E、tenant isolation、既存機能テストが成功しています。

ただしP0-9は実サービスを使うステージング受入段階になるため、実施時にはWhatsApp、Google Calendar、Anthropic、Resendなどのテスト用アカウントと安全な秘密情報設定が別途必要です。

P0-9は明示的な指示があるまで開始しません。
