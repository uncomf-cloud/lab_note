# 🧪 電子実験ノート (lab_note)

研究・実験プロジェクト **`laboratory`** 内の各プロジェクト（研究テーマ）ごとのプロトコルおよび実験結果・データを管理・記録・活用するためのWindowsデスクトップアプリケーションです。

---

## 🎯 特徴 & 機能

1. **ワンクリック exe 起動 & スタートメニュー対応**
   - 黒いコマンドプロンプト画面を出さずにバックグラウンド起動する **`LabNote.exe`** を搭載。
   - **スタートメニュー** および **デスクトップ** に「電子実験ノート」ショートカットが自動登録されます。
   - **スタートメニュー** および **デスクトップ** に「電子実験ノート」ショートカットが自動登録されます（初回起動時のみ）。
2. **プロジェクト（研究テーマ）階層の完全統合**
   - 実験データは各研究テーマ配下の `experiments/`（`laboratory/projects/{project_id}/experiments/`）に整然と保管。
   - 左ペインのツリービューでテーマごとの実験ノートを快適に閲覧・切り替え可能。
3. **右クリックメニューによる直感的操作**
   - **プロジェクト**: 新規ノート作成、テーマの非表示、非表示テーマの再表示
   - **実験ノート**: PDF出力、複製（引き継ぎエディタ展開）、削除
   - **プロトコル**: 編集、複製（引き継ぎ登録画面展開）、削除
4. **Markdown入力領域の最大化 & 全画面トグル**
   - メタデータは2段コンパクト設計。入力ペイン・プレビューペインそれぞれに全画面切り替えボタン（`⛶`）を装備。
5. **PDF出力**
   - エディタ右上の「📄 PDF出力」ボタンから、A4用紙サイズに最適化されたクリーンなレイアウトでPDF保存が可能。

---

## 📂 ディレクトリ構成

```text
C:\Users\uncom\Documents\
├── lab_note\                              # 本アプリケーション
│   ├── LabNote.exe                        # [推奨] ネイティブ起動ランチャー
│   ├── app_icon.ico                       # アプリアイコン
│   ├── LabNote.cs                         # C# ランチャーソース
│   ├── .venv\                             # Python仮想環境
│   ├── main.py                            # FastAPI バックエンドサーバー
│   ├── mcp_server.py                      # MCP サーバー（AI連携用ツール群）
│   ├── storage.py                         # Markdown/YAMLパーサー・プロジェクト管理
│   ├── config.py                          # 設定（laboratory へのパスなど）
│   ├── static\                            # Webフロントエンド
│   │   ├── index.html                     # ツリービュー付きダッシュボード
│   │   ├── css\style.css                  # スタイルシート（リサイザー・印刷CSS）
│   │   └── js\app.js                      # ツリー開閉 & 右クリックメニュー
│   └── README.md
│
└── Antigravity\laboratory\                # 実験データ管理リポジトリ（連携先）
    ├── shared\
    │   └── protocols\                     # 共通プロトコル原本（Markdown + YAML Frontmatter）
    └── projects\                          # 各研究テーマ
        ├── 01_tNP_assay\
        │   └── experiments\
        │       └── 2026-09-16_xxx\
        │           ├── note.md            # ノート本文（Markdown + YAML）
        │           └── raw_data.csv       # 添付データ
        └── ...
```

---

## 🚀 起動方法

### 方法 1: スタートメニュー / デスクトップから起動（推奨）
1. スタートメニューを開いて **「電子実験ノート」** をクリック（またはデスクトップのショートカットをダブルクリック）。
2. 黒い画面を出さずにバックグラウンドで起動し、アプリアイコン付きの専用ウィンドウが開きます。

### 方法 2: LabNote.exe を直接実行
[`C:\Users\uncom\Documents\lab_note\LabNote.exe`](file:///C:/Users/uncom/Documents/lab_note/LabNote.exe) をダブルクリックして起動します。

---

## 🤖 MCP サーバー機能 (AI・Antigravity連携)

Google Antigravity や Claude Desktop などの AI エージェントから、電子実験ノートのプロトコルや実験ノートを直接操作するための Model Context Protocol (MCP) サーバー（[`mcp_server.py`](file:///C:/Users/uncom/Documents/lab_note/mcp_server.py)）を標準搭載しています。

### 提供ツール一覧 (9 Tools)

| 分類 | ツール名 | 機能説明 |
| :--- | :--- | :--- |
| **プロトコル管理** | `list_protocols` | `shared/protocols/` 内の全プロトコル一覧・メタデータを取得 |
| | `get_protocol` | 指定プロトコルの詳細情報および手順チェックリスト（Markdown）を取得 |
| | `save_protocol` | プロトコルを新規作成または更新（Frontmatter自動構築、UI即時反映） |
| | `delete_protocol` | 指定プロトコルを削除 |
| **実験ノート・プロジェクト** | `list_projects` | 登録されている研究テーマ（プロジェクト）一覧を取得 |
| | `list_experiments` | 全プロジェクトまたは特定プロジェクト内の実験ノートを検索・一覧取得 |
| | `get_experiment` | 実験ノート詳細（note.md 本文、メタデータ、添付ファイル）を取得 |
| | `create_experiment` | 新規実験ノートを作成（プロトコル手順の自動埋め込みに対応） |
| | `update_experiment` | 実験ノートの進捗ステータス（in_progress/completed/failed）や結果を更新 |

### Antigravity 連携設定 (`laboratory/.agents/plugins/lab-note/`)

本 MCP サーバーは、`laboratory` ワークスペースのプラグインとして登録されています。
`laboratory/.agents/plugins/lab-note/` 配下の設定ファイルを通じて、`protocol-designer` や `data-analyst` などのエージェントが自動的にツールを利用できるようになります。

**1. `plugin.json`**
```json
{
  "name": "lab-note",
  "description": "LabNote electronic lab notebook and protocol manager MCP server integration"
}
```

**2. `mcp_config.json`**
```json
{
  "mcpServers": {
    "lab-note": {
      "command": "C:\\Users\\uncom\\Documents\\lab_note\\.venv\\Scripts\\python.exe",
      "args": [
        "C:\\Users\\uncom\\Documents\\lab_note\\mcp_server.py"
      ],
      "env": {
        "PYTHONPATH": "C:\\Users\\uncom\\Documents\\lab_note"
      }
    }
  }
}
```

