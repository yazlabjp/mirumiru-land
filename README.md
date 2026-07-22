# みるみるランド (mirumiru-land)

特別支援教育向けビジョントレーニングWebアプリシリーズ。

- 想定環境: 学校iPad / Safari / GitHub Pages(サーバーレス)
- 記録方針: 端末ごと・直近10回+ベストのみ(個人情報ゼロ)
- 現在のフェーズ: **Phase 0(土台づくり)** — core v1 最小版 + C-01「タッチであつまれ!」

## 開発規約(実装AIへ)

実装を行う際は次の3点のみを根拠とする(設計書全文は渡さない):

1. `docs/ai-notes.md` — 実装規約ノート(設計書の曖昧箇所を確定。矛盾時はこちらが優先)
2. `docs/vt-api.md` — VT core APIリファレンス(規範仕様。存在しない`VT.*`を呼ばない)
3. `docs/specs/<app-id>.md` — 該当アプリの仕様書

矛盾時の優先順位: **vt-api.md > ai-notes.md > 該当spec > docs/design.md**

## フォルダ構成

```
core/v1/          coreライブラリ(バージョン固定)
apps/             1アプリ=1フォルダ
_template/        新作の雛形
docs/             design.md / vt-api.md / ai-notes.md / specs/ / checklist.md 等
apps.json         全アプリ登録簿(唯一の情報源)
```

## ドキュメント

- [設計書](docs/design.md)
- [VT core APIリファレンス](docs/vt-api.md)
- [実装規約ノート](docs/ai-notes.md)
- [アプリ仕様書一覧](docs/specs/)

## ライセンス

MIT License. 詳細は [LICENSE](LICENSE) を参照。
