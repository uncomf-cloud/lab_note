# Electronic Lab Notebook (lab_note) Project Directive

このファイルは、`lab_note`（電子実験ノート）プロジェクトにおけるアーキテクチャ、技術スタック、最新のデータ仕様、開発ガイドライン、および自律的運用のルールを定めたものです。

---

## 1. プロジェクト概要

`lab_note` は、研究・実験データ管理リポジトリ `Antigravity/laboratory/` と連携し、各研究テーマの実験プロトコルおよび実験ノート（Markdown + YAML Frontmatter）を記録・閲覧・管理・活用するためのWindowsデスクトップ＆MCP統合アプリケーションです。

### 主な特徴 & 最新仕様
- **デスクトップ統合**: `LabNote.exe`（C# ランチャー）によるバックグラウンド起動と専用アプリアイコン・ウィンドウでの表示。
- **ステータス分離型実験記録管理**:
  - 実験ノートは進行状況に応じて `experiments/in_progress/`（進行中）または `experiments/completed/`（完了）配下に保管。
  - UIやAPIでのステータス変更時、フォルダが自動的に移動。レガシー構造からの自動マイグレーション機能（`migrate_experiments_to_status_dirs`）を搭載。
- **プロトコルIDの標準化**:
  - `<連番2桁>-<名称>-<yymmdd>` 形式（例: `01-PCR-260916`）でプロトコルIDを自動生成・採番。
- **添付ファイル管理**: 各実験ノートフォルダ内に測定データ（CSV、Excel、画像等）を保存・連携可能。
- **AI・Antigravity連携**: `mcp_server.py` による MCP (Model Context Protocol) ツール群の提供（AIエージェントからのノート自動作成・参照・更新）。

---

## 2. システム構成 & アーキテクチャ

```text
C:\Users\uncom\Documents\lab_note\
├── LabNote.exe                 # [推奨] C# 製バックグラウンドランチャー
├── LabNote.cs                  # ランチャーソースコード
├── app_icon.ico / app_icon.png # アプリアイコン
├── .venv/                      # Python 仮想環境
├── main.py                     # FastAPI Webサーバー（REST API / 静的ファイル配信 / マイグレーション）
├── storage.py                  # データ入出力（Markdown/YAML Frontmatter パーサー、ステータス移動、ファイル操作）
├── config.py                   # 設定管理（ポート、パス解決、環境変数読み込み）
├── mcp_server.py               # MCP (Model Context Protocol) サーバー（AI連携ツール群）
├── requirements.txt            # Python依存ライブラリ
├── run.py / run_server.bat     # サーバー起動スクリプト
├── static/                     # フロントエンド資産
│   ├── index.html              # UI ダッシュボード（ツリービュー・Markdownエディタ・プレビュー）
│   ├── css/style.css           # スタイルシート（リサイザー・印刷/PDF最適化・テーマ）
│   └── js/app.js               # クライアントサイドロジック（右クリックメニュー・状態管理・ドラッグ）
└── GEMINI.md                   # 本プロジェクト開発規約
```

### 連携先データリポジトリ (`laboratory`)
- **進行中実験ノート**: `laboratory/projects/{project_id}/experiments/in_progress/{experiment_id}/note.md`
- **完了済み実験ノート**: `laboratory/projects/{project_id}/experiments/completed/{experiment_id}/note.md`
- **共通プロトコル原本**: `laboratory/protocols/*.md` および `laboratory/shared/protocols/`

---

## 3. 技術スタック & 依存ライブラリ

- **Backend**: Python 3.10+
  - `fastapi`, `uvicorn`: Web API サーバー
  - `python-frontmatter`: Markdown YAML Frontmatter の解析と生成
  - `markdown`: Markdown HTML 変換
  - `python-dotenv`: 環境変数管理
  - `mcp`: Model Context Protocol SDK (AIエージェント連携)
- **Frontend**:
  - HTML5, CSS3, JavaScript (Vanilla JS, 外部ライブラリ依存なし)
  - PDF出力機能（ブラウザ印刷CSS `@media print` 経由で最適化）
- **Launcher**:
  - C# (.NET Framework / `csc.exe` コンパイル、Edge App Mode 起動)

---

## 4. 開発・実行規約 (Development Guidelines)

### 4.1 自律実行と安全管理（承認作業の最適化）
- **日常的開発の自律実行**:
  - コードの修正、新規ファイル作成、バグ調査、構文チェック、およびテストコマンドの実行は、**都度のユーザー承認（y/n）を求めず、自律的に進めて完了報告を行う**こと。
- **事前確認が必要なケース（安全弁）**:
  - 既存の実験ノート・生データフォルダの物理削除（`rmtree` 等）
  - 不可逆または破壊的な Git 操作（`git reset --hard`、強制プッシュ等）
  - 本番運用環境への影響が大きい破壊的変更
  - 上記に該当する場合のみ、具体的な影響範囲を説明し、事前にユーザー確認を取ること。

### 4.2 コマンド実行の原則
- PowerShell 上でコマンドを実行する際は、`;` や `&&` 等で複数のコマンドを1行に連結せず、必ず **1コマンドずつ分割して実行** すること。
- Python コマンドは原則として本プロジェクト配下の仮想環境（`.venv\Scripts\python.exe`）を使用すること。

### 4.3 文字コード & ファイルパス
- ファイルの作成・編集・読み込みは常に **UTF-8 (BOMなし)** を使用すること。
- Windows 環境であることを考慮し、パスの区切り文字やスペースを含むパスのエスケープに十分配慮すること。

### 4.4 コード品質とエラーハンドリング
- **保守性**: 各関数・エンドポイントには型ヒント（Type Hints）と分かりやすい Docstring を付与すること。
- **堅牢性**: `storage.py` において、Frontmatter のパースエラーや不正なメタデータ、ファイル未存在時にもサーバーが異常終了しないよう、適切なフォールバック処理を実装すること。
- **データ整合性**: ステータス更新や移動処理の際は、データの欠損やメタデータの消失が起きないよう検証すること。
