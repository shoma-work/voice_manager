# GitHub に載せて GitHub Pages で公開する手順

このプロジェクトは **静的サイト**（HTML / CSS / JS）だけなので、ビルド不要で GitHub Pages にそのまま載せられます。

公開後の URL は例として次の形になります。

- `https://あなたのユーザー名.github.io/リポジトリ名/`

HTTPS が付くので、マイク（getUserMedia）は一般的なブラウザで利用できます。

---

## 1. GitHub でリポジトリを新規作成

1. https://github.com/new にログインして開く  
2. Repository name に例: `voice_manager_web`  
3. Public を選ぶ（無料で Pages が使いやすい）  
4. **README は追加しなくてよい**（ローカルからプッシュする場合）  
5. Create repository

---

## 2. このフォルダを Git で初期化してプッシュ

PC で **Git for Windows** が入っている前提です。コマンドプロンプトまたは PowerShell で、このフォルダに移動して実行します。

```powershell
cd "ここに Voice_manager_web のパス"

git init
git add .
git commit -m "Initial commit: voice_manager web"

git branch -M main
git remote add origin https://github.com/あなたのユーザー名/voice_manager_web.git
git push -u origin main
```

（初回は GitHub のログインまたは Personal Access Token が必要です。）

---

## 3. GitHub Pages を有効にする

1. GitHub のそのリポジトリを開く  
2. **Settings** → 左メニュー **Pages**  
3. **Build and deployment** の **Source** で **Deploy from a branch** を選ぶ  
4. Branch を **`main`**、フォルダを **`/ (root)`** にして Save  

数分すると上部に **`Your site is live at https://....`** と表示されます。

---

## 注意（パスについて）

CSS と JS は **`css/`・`js/` の相対パス**なので、Pages が **リポジトリのルート**から配信されていれば、そのままで動きます。

もし将来「ユーザー名.github.io」の **ユーザーサイト用リポジトリ**（`ユーザー名.github.io` という名前）だけに載せる場合も、ルートに `index.html` があれば同様です。

---

## よくあるつまずき

| 現象 | 対処 |
|------|------|
| 404 | Pages の設定が保存されるまで数分待つ。Branch が main / root か確認 |
| 真っ白・CSS が効かない | ブラウザの開発者ツール → Network で 404 がないか確認（パス変更していないか） |
| マイクが使えない | `file://` で開いていないか確認。**https の公開 URL** で試す |

---

## 更新のしかた

コードを直したあと:

```powershell
git add .
git commit -m "変更内容の説明"
git push
```

GitHub Pages は自動で最新の main を反映します（反映まで 1〜数分かかることがあります）。
