# Phase 2 実装結果：en-US Auto Repair Shop 有料パイロット

- 実施日: 2026-08-19（JST）
- Phase 1基準コミット: `23d709d`
- 作業branch: `agent/phase2-auto-repair-pilot`
- 管理先: `murantsu/whatsapp-receptionist` のみ
- 検証Node.js: `v22.23.2`
- 対象: P0-5、P0-6、P0-7のみ

## 結論

Phase 2で指定された英語AI受付、安全判定、FAQ、human handoff、英語予約、主要管理画面の英語化とMVP外機能の非表示を実装しました。全面的な書き直しは行わず、既存のWhatsApp、予約、Google Calendar、FAQ、会話管理、Supabaseの経路を再利用して必要箇所だけを拡張しています。

Node.js 22で通常テスト619件、Phase 1の実DB tenant isolationテスト16件、Playwright E2E 56件がすべて成功しました。forkのdraft PRではGitHub Actions 7 jobがすべてgreenです。実WhatsApp、実Google Calendar、実Anthropic等のアカウントは使用せず、外部連携の成功・失敗はfake/mockで検証しています。

P0-8とP0-9には着手していません。したがって、Phase 2の商品機能は完了していますが、有料パイロット開始可否の最終判定には、次のPhaseでP0-8のrelease gateとP0-9の実サービス接続試験が必要です。

## 1. 実装した内容

### P0-5: 英語AI、FAQ、安全判定、fallback、human handoff

- `en-US`向けに、FAQ、予約、予約変更、予約取消、営業時間、料金、human requestを判定する英語intentを追加しました。
- AIのsystem promptをAuto Repair Shopの受付範囲に限定しました。故障原因、走行可能性、安全性、在庫、料金、営業時間、修理可否を、登録情報なしに作り上げないよう明示しています。
- 登録済みFAQに根拠がない質問、AIが低信頼の場合、AI応答が失敗した場合、顧客が人を希望した場合は、推測で回答せずhuman handoffにします。
- 安全に関係する症状や走行可否の質問では診断を行わず、運転を避け、適切なroadside assistance、emergency service、または専門家へ連絡する趣旨の英語案内を返してhuman handoffにします。
- handoff理由、顧客向け案内、担当者向けメール通知を英語化しました。
- `STOP`、`unsubscribe`、`remove me`等の英語opt-outを追加し、「cancel my appointment」は配信停止ではなく予約取消として扱います。
- 英語パイロットでは、DBに古い音声有効フラグが残っていても音声入力を処理せず、テキスト送信を依頼するよう実行境界を追加しました。

### P0-6: 英語予約、timezone、Calendar失敗時handoff

- 既存booking extractor/bridgeを拡張し、次の英語表現を扱えるようにしました。
  - `tomorrow afternoon`
  - `next Friday at 3 PM`
  - `Friday morning`
  - `move my appointment to Friday at 11 AM`
  - `cancel my appointment tomorrow`
- tenant設定のtimezoneを、日付解釈、空き時間検索、予約表示へ使用します。
- `03/04`のような数値日付は推測せず、月名を使った確認を英語で依頼します。
- Auto Repair Shopの予約受付で、必要に応じて氏名、電話番号、車両メーカー、モデル、年式、希望サービス、症状、希望日、希望時間、緊急度を収集します。既に受け取った情報は会話状態へ保存し、再質問しません。
- `Toyota`、`Camry`、`2020`のような短い続きの回答も、進行中の受付状態がある場合に限って安全に統合します。新規の曖昧な短文を単独で予約扱いにはしません。
- 予約作成、変更、取消を英語で完走できるようにしました。未完了の予約途中でも、明示的なhuman requestを優先します。
- Google Calendar同期をパイロット経路では必須にしました。`synced`を確認した場合だけ予約確定を伝えます。
- Calendar未設定、timeout、認証失敗、競合、同期失敗、必要なevent ID欠落では、予約成功と伝えず、「まだ確定しておらず、担当者の確認待ち」という英語案内を返し、human handoffへ移します。
- 車両・症状・緊急度等は、既存DB schemaを大きく変更せずappointment notesへ保存します。

### P0-7: 主要UIの英語化とMVP外機能の非表示

- パイロットで顧客企業が使用する主要画面を英語化しました。
- navigationとSettingsから、billing、voice、team/multiple staff、Agency等のMVP外導線を外しました。既存実装や過去migrationは削除していません。
- Google Calendar設定とhandoff email設定を、既存APIを再利用した英語画面として追加しました。
- onboardingに`us_auto_repair` profileを追加し、US、`en-US`、Auto Repair Shop、音声無効、単一サービスの安全な初期値を設定できるようにしました。既存イタリア向け初期値は残しています。
- Servicesの価格表示をパイロット画面でUSD / `en-US`へ変更しました。
- self-service Stripe billing、Italian billing/SDI、Fatture in Cloud、voice、Agency、white-label、複数スタッフ、複数拠点は削除せず、パイロットの主要導線から非表示または無効にしました。

## 2. 変更した主要ファイル

### AI・安全・会話

- `src/server/ai/intent-router.ts`
- `src/server/ai/llm-intent-classifier.ts`
- `src/server/ai/domain-reply.ts`
- `src/server/ai/reply-orchestrator.ts`
- `src/server/whatsapp/auto-reply.ts`
- `src/server/whatsapp/service.ts`
- `src/server/whatsapp/repository.ts`
- `src/server/conversations/escalation.ts`
- `src/lib/pilot/auto-repair.ts`

### 予約・Calendar

- `src/server/ai/booking-extractor.ts`
- `src/server/ai/booking-bridge.ts`
- `src/app/(dashboard)/calendar/page.tsx`
- `src/app/(dashboard)/settings/calendar/page.tsx`
- `src/components/settings/GoogleCalendarConnection.tsx`

### UI・設定・onboarding

- `src/components/dashboard/DashboardShell.tsx`
- `src/app/(auth)/login/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/(dashboard)/conversations/`
- `src/app/(dashboard)/knowledge/page.tsx`
- `src/app/(dashboard)/settings/`
- `src/components/settings/`
- `src/components/onboarding/OnboardingForm.tsx`
- `src/server/onboarding/tenant-onboarding.ts`
- `src/app/api/onboarding/tenant/route.ts`

## 3. 追加・変更したテスト

- 英語intentとLLM promptのAuto Repair Shop制約
- 登録済みFAQ回答、根拠なし質問のfallback、低信頼fallback、明示的human request
- 車両安全質問のescalationと英語顧客案内
- `STOP` / `unsubscribe` / `remove me`と予約取消の区別
- `en-US`での音声入力無効化
- 英語日付・曜日・AM/PM・daypart・数値日付の曖昧性
- 顧客・車両・サービス・症状・緊急度の段階的収集と再質問防止
- 英語予約作成、変更、取消
- Calendar成功、未設定、timeout、認証失敗、競合、同期失敗時handoff
- 予約途中のhuman request割込み
- US Auto Repair onboarding初期値
- パイロットnavigation、英語主要route、MVP外導線非表示
- WhatsAppから予約までの英語E2Eフロー

主なテストファイル:

- `tests/server/ai/booking-bridge.test.ts`
- `tests/server/ai/booking-extractor.test.ts`
- `tests/server/ai/reply-orchestrator.test.ts`
- `tests/server/ai/domain-reply.test.ts`
- `tests/server/conversations/escalation.test.ts`
- `tests/server/whatsapp/webhook-service.test.ts`
- `tests/server/e2e/whatsapp-booking-flow.test.ts`
- `tests/server/onboarding/tenant-onboarding.test.ts`
- `tests/smoke/phase2-pilot-ui.test.ts`

## 4. 全テスト・検査結果

| 検査 | 結果 |
|---|---|
| Node.js | `v22.23.2` |
| 通常テスト | **84 files / 619 tests、全成功** |
| Phase 1 tenant isolation実DBテスト | **1 file / 16 tests、全成功** |
| Playwright E2E（GitHub Actions） | **56 tests、全成功** |
| TypeScript | 成功 |
| ESLint | 0 errors、既存warning 3件 |
| RLS migration lint | 22 tables、成功 |
| `npm audit`（全依存） | 0 vulnerabilities |
| `npm audit --omit=dev` | 0 vulnerabilities |
| GitHub Actions Production build | 成功 |
| GitHub Actions全体 | **7 jobs、全green** |
| ローカルWindows Next.js build | compile、型・lint、94/94ページ生成まで成功。最後のWindows traceで既知のP0-8 `EPERM C:\Users\Users` |

通常テストはWindows/OneDriveでAPI route読込が遅いため、ローカル実行時だけ`--testTimeout=120000`を指定しました。テスト内容や本番コードを回避する変更はしていません。タイムアウトの標準化はP0-8のrelease gateで扱います。

最初のPlaywright CIでは、英語化後のSign in画面に対して古いイタリア語文言を期待する14件と、共通フォームの英語エラーがMVP外のイタリア語Contact/Register画面へ漏れた2件が失敗しました。前者は仕様に合わせてE2E期待値を英語へ更新し、後者は共通hookをlocale対応にして既定のイタリア語を維持、パイロット主要フォームだけ`en-US`を明示する局所修正を行いました。再実行では56件すべて成功しています。

## 5. 既存機能への影響

- Phase 1のmigration、tenant role、service-role境界、RLS保護は変更していません。tenant isolation 16件が再度すべて成功しています。
- イタリア語の既存booking、voice、Stripe、SDI等の実装は削除していません。通常テスト全体が成功しており、重大な回帰は確認されませんでした。
- Contact/Register等のMVP外イタリア語画面は、共通フォームの既定localeを`it-IT`へ戻して既存文言を維持しました。英語化はパイロット主要フォームから明示的に選択します。
- `en-US`パイロット経路だけ安全要件を強制し、既存イタリア語経路は原則維持しています。
- navigationから外したMVP外機能のrouteとコードは残っているため、将来必要になった場合は再利用できます。
- 新規dependency、DB migration、schema全面変更は追加していません。

## 6. 未解決問題

1. Windowsで`next build`の最終output traceが`EPERM C:\Users\Users`になる既知問題は未修正です。これは計画どおりP0-8の対象です。
2. 実WhatsApp、実Google Calendar OAuth、実Anthropic、実handoff emailの接続試験は未実施です。計画どおりP0-9の対象です。
3. 各pilot tenantで正しいUS timezone、営業時間、サービス、FAQ、Google Calendar、handoff emailを設定する必要があります。
4. 車両情報は最小変更のためappointment notesへ保存しており、車両専用DB項目や検索画面は作っていません。
5. 主要パイロット画面以外のブログ、help、SEO、非表示routeにはイタリア語が残ります。
6. Calendar同期失敗の自動再試行基盤は作っていません。1〜3社のmanaged pilotではhandoff後の手動確認で運用します。

## 7. 実際の画面で英語になった範囲

- Sign in
- Dashboard
- Conversations一覧
- Conversation detail / human reply
- Appointments / Calendar
- Knowledge Base / FAQ
- Services
- Business hours
- Google Calendar settings
- WhatsApp settings
- Handoff email settings
- Settings入口
- US Auto Repair onboarding

Dashboard navigationは`Dashboard`、`Conversations`、`Appointments`、`Knowledge Base`、`Settings`に限定しました。Billing、voice、team、Agency等は主要導線に表示しません。

## 8. Auto Repair Shop向けに変わった内容

- AIの役割を受付、情報収集、登録済みFAQ回答、予約、人への引き継ぎに限定しました。
- 車両の故障診断、走行安全性の断定、緊急度の難しい判断をAI単独で行わない安全規則を追加しました。
- 氏名、電話、make、model、year、service、symptoms、preferred date/time、urgencyを必要な分だけ段階的に収集します。
- すでに受け取った情報を保持し、同じ情報を再質問しない会話状態を追加しました。
- Auto Repair Shop用のUS onboarding profileと`Oil change`の初期serviceを追加しました。
- FAQや登録情報にない料金、営業時間、在庫、サービス可否を推測せずhuman handoffにします。

## 9. Phase 3へ進める状態か

**Phase 2の範囲は完了しており、確認後にPhase 3へ進める状態です。**

ただし、現時点で「有料パイロットを開始してよい」という意味ではありません。次は計画どおり、P0-8でNode.js 22の再現可能なrelease gateをgreenにし、その後P0-9で実サービスを使ったステージング受入試験を完了する必要があります。

P0-8またはP0-9は、ユーザーの明示確認を受けるまで開始しません。

## 10. 手動確認が必要なこと

### 今回の変更を目視確認する項目

1. Desktopとmobileで、上記主要画面が英語で自然に表示されること。
2. navigationとSettingsに、billing、voice、team、Agency、white-label、SDI等が表示されないこと。
3. ServicesがUSD表示で、Business hoursがUSパイロット向けに理解しやすいこと。
4. Conversation detailからhuman replyを送る導線が分かりやすいこと。

### P0-9までに準備・決定する項目

1. 各店舗の正しいIANA timezone（例: `America/New_York`）。
2. 実際の営業時間、提供service、価格、所要時間、FAQ。
3. human handoffを受ける常時確認可能なメールアドレス。
4. staging用WhatsApp番号、Google Calendar、Anthropic、Resend、Supabase、公開URL。
5. 安全な営業時間外運用と、handoff後に誰が何分以内に返信するかという業務ルール。

## Phase 2で行っていないこと

- P0-8 release gateの修正
- P0-9実アカウントによるstaging試験
- 音声入力・音声返信
- Stripe self-service billing
- 複数スタッフ、複数拠点、複数Calendar
- Agency、white-label、Fatture in Cloud、SDI
- 大規模な管理画面再設計
- 既存イタリア機能の削除
- P1/P2機能の先行実装
