# Loutre Official Website Architecture

- Status: **Accepted**
- Date: 2026-08-30
- Scope: 公式サイト / documentation presentation / static hosting

## Context

LoutreにはREADME、Getting Started、Architecture、ADR、examplesなど、利用者と開発者のための情報がすでにrepository内に存在する。
一方で、GitHub上のMarkdownだけでは、Loutreが何を解決するframeworkなのかを初見で把握する導線、利用者向けdocumentationのナビゲーション、公式な公開URLを十分に提供できない。

公式サイトには次の性質が必要になる。

- Loutreの価値と特徴を短時間で理解できるlanding pageを持つ。
- repository内のdocumentationと内容が乖離しない。
- server runtimeを必要とせず、静的配信だけで成立する。
- framework本体と同じrepositoryで変更を追跡できる。
- サイト固有の都合をLoutre本体のpackage境界へ持ち込まない。
- build成果物をrepositoryへcommitする運用を要求しない。

## Decision

Loutre公式サイトは、repository直下の`website/`に置くNext.js applicationとして構築する。
Next.jsはApp Routerを利用し、`output: "export"`によるstatic exportのみを公開対象とする。

公開先はGitHub Pagesとし、GitHub Actionsでsourceからsiteをbuildしたあと、生成された静的artifactをGitHub Pagesへdeployする。
`gh-pages` branchやbuild済みartifactをsource treeへ保持しない。

公式URLは`https://loutrejs.come25136.id`とする。
カスタムドメインはGitHub Pagesのrepository settingsで管理し、DNSからGitHub Pagesへ向ける。domain設定をsource treeの`CNAME`ファイルへ依存させない。

## Documentation source of truth

利用者向けdocumentationの正本は既存の`docs/`とする。

`website/`配下に同じ内容をMDXや独自contentとして複製しない。公式サイトは`docs/`のMarkdownをbuild時に読み込み、Web向けのnavigation、layout、code highlighting、table of contentsなどのpresentationを提供する。

この境界により、documentationはGitHub上でも単独で読めるplain Markdownを維持し、Webサイトが存在しなくても意味が失われない。

Webサイトのnavigationはfilesystem構造から暗黙に生成せず、サイト側で明示的に定義する。`docs/adr/`やrelease手順などrepositoryには必要でも一般利用者のnavigationには不要な文書を、contentの配置だけを理由に公開navigationへ含めないためである。

## LP・機能詳細・Docsの役割

LPは、初めて訪れた人が機能の利点を短時間で判断するための入口とする。各機能の紹介は短い説明と代表的なコード例または小さな図に絞り、操作を伴う比較や利用条件の説明は機能詳細ページへつなぐ。LPだけで利用手順まで完結させようとすると、初見の読者がサイト全体を把握しにくくなるためである。

LPでは未説明のAPI名を入口の説明に使わず、標準サポートの範囲と読者の利点を先に示す。機能の説明は基盤となるモデルから活用例の順に並べ、最後にすぐ試せるサンプルへ案内する。

見出しは情報の包含関係に合わせる。ページの主題を`h1`、主要な機能のまとまりを`h2`、その中の個別機能を`h3`とし、GraphQLに含まれるBatch Resolutionなどを独立した主要セクションとして重複させない。

紹介文は、機能名と具体的な動作を短く記す。抽象的な宣伝文や装飾用の英語ラベルを重ねると、利用できる機能を探しにくくなるためである。[Hono](https://hono.dev/)や[React日本語版](https://ja.react.dev/)のように、説明のそばにコード例とドキュメントへの導線を置く。日本語の推敲は[yomiyasu](https://github.com/nanaism/yomiyasu)を参考にし、API名や適用条件を保つ。見出しや段落の改行を画面幅にかかわらず固定せず、図やコードは本文と同じコンテンツ幅に収める。

機能詳細ページは、図解や操作できる例を通じて、機能の動作と利用場面を理解するために設ける。LPから直接参照できる静的なURLを持ち、同じ機能の実装ガイドや実行可能なサンプルへつなぐ。ページ内で必要な比較コードは示すが、API仕様や導入手順を別の正本として複製しない。

比較図の前に、機能が必要になる場面と処理の前提を説明する。Batch Resolutionでは、GraphQLが一覧の関連フィールドを要素ごとに解決し、その都度データを取得すると問い合わせが増えることを説明してから、個別取得と一括取得を比較する。注文や商品などの業務上の具体例は実装例で導入し、仕組みの理解に不要なドメイン知識を比較図へ持ち込まない。

機能詳細ページは文書として読み進められる構成にする。[Vite](https://vite.dev/guide/)や[Drizzle](https://orm.drizzle.team/docs/overview)を参考に、本文の行長を制限し、ページ内ナビゲーションを本文の脇に置く。狭い画面ではナビゲーションを本文の前に並べる。セクションごとにカードを重ねたり、指標だけを大きく配置したりせず、本文、図、コードの順序と見出しで区切る。

比較図は取得件数などの前提をそろえ、接続線と呼び出し回数を対応させる。Loutre DevToolsと同様に細い枠のノードとオレンジの接続線を使い、既存のエディタ表示と共存させる。Batch Resolutionの機能詳細は個別取得と一括取得の比較、およびloadの実装例に絞る。先読みデータの再利用やバッチの適用条件はDocsで扱う。バッチ化と再利用を同じページで説明すると、何によって呼び出し回数が減ったのか区別しにくいためである。

Docsは導入手順、APIの契約、適用条件を参照するための文書とし、引き続き`docs/`を正本とする。説明の詳しさに応じてLP、機能詳細、Docsを使い分け、すべてのページへ同じ情報を掲載しない。

Docsの概念説明に必要な図は、その説明の中に配置する。N+1問題の取得回数など、図で示した方が理解しやすい関係を長い文章だけで説明せず、別ページへ移動しなくても前提と動作を理解できるようにする。機能詳細ページへのリンクは補助として扱う。

画面幅に合わせて図全体を縮小しすぎると、関係を追えてもラベルを読めなくなる。図とコードは読める大きさを保ち、必要な横スクロールはその領域内に収める。構成図の接続線、余白、ノード間隔も、本文と同じくモバイル・タブレット・PCで確認する。長い識別子やライセンス表記は折り返し、ページ全体の横スクロールを発生させない。

LPのDevToolsデモは、最初に選択しているノードを表示の中心に置く。接続先をすべて収めようとすると、狭い画面では選択中のノードが見えなくなるためである。周辺の構造はパンとズームで確認できるようにする。

Docsから公式サイトを参照するURLは、GitHub上でも移動できる絶対URLで記す。サイトで表示するときは公式サイト内のURLを内部パスへ変換し、開発環境やプレビューから本番へ移動しないようにする。クエリとフラグメントは保持し、外部サイトのリンクは変換しない。

## Repository boundary

`website/`はLoutre monorepoのworkspaceとして扱うが、`packages/`には置かない。

公式サイトはnpmへ配布するLoutre packageではなく、repositoryに付随するWeb applicationである。package distribution、Changesets、Loutreのpublic API versioningとは独立したlifecycleを持つ。

frameworkの変更とdocumentationの変更を同じpull requestで同期できるよう、別repositoryには分離しない。

## Rendering and routing

サイトはserver renderingを前提としない。
各公開routeはbuild時に静的HTMLとして確定し、その後のnavigationではReactによるclient-side navigationを利用できる構成とする。

`index.html`一枚へ全routeを集約するstrictなSPAにはしない。documentationは個別URLへの直接アクセス、検索エンジンやlink previewからの参照、JavaScript実行前のcontent取得が自然に成立する方を優先する。

動的なrequest context、Server Actions、runtime API、ISRなど、serverの存在を必要とするNext.js機能は公式サイトの前提にしない。
将来それらが必要になった場合は、GitHub Pagesを維持できる範囲に無理に押し込まず、このADRを再検討する。

## Deployment

GitHub Actionsをsite buildとGitHub Pages deploymentの境界とする。

Pull Requestではsiteがstatic export可能であることをCIで検証し、`main`への反映後にPages用workflowがbuild artifactを生成してdeployする。
GitHub Pages固有のdeployment permissionやenvironmentは通常のCIから分離し、frameworkのquality checksへ不要な権限を与えない。

Actionsはrepositoryの既存方針と同様にfull commit SHAでpinする。

## Alternatives

### GitHub Pagesのsource branchへbuild成果物をcommitする

採用しない。

sourceと生成物が同じhistoryへ混在し、site更新のたびに本質的でない差分が増える。GitHub PagesはGitHub Actionsから生成artifactを直接deployできるため、生成物をversion管理する理由がない。

### Cloudflare Pages

採用しない。

静的サイトの配信要件はGitHub Pagesで満たせる。repository、CI、deploymentをGitHub内で完結できる状況で、hosting providerを追加する具体的な利点がない。

`come25136.id`のDNS管理にCloudflareを利用することと、site hostingにCloudflare Pagesを採用することは分離して考える。

### Cloudflare Workers

採用しない。

公式サイトは静的配信だけで成立し、requestごとのserver logicを必要としない。Worker runtimeを導入すると、現在の要件に対してdeploymentとruntimeの責務が増えるだけになる。

### VitePress

採用しない。

VitePressはdocumentation主体のsiteには適しているが、Loutre公式サイトではdocumentationだけでなく、frameworkのidentityや特徴を表現するlanding pageも同等に重要になる。
Next.jsのReact component modelを利用しながら、documentationの正本はplain Markdownとして外側に保つ方を選ぶ。

### Vite + React Routerによるstrict SPA

採用しない。

静的hostingとの相性は良いが、documentation routeを個別の静的HTMLとして生成できる利点を捨てる必要がない。
Next.js static exportでserverを持たずに同じ配信条件を満たせるため、strict SPAをarchitecture上の制約にはしない。

### Documentationを`website/`配下へ移す

採用しない。

Web presentationをdocumentationの正本にすると、GitHub上のdocumentationと公式サイトを独立して扱いにくくなる。またADRなど開発者向け文書までsite frameworkのcontent modelへ従わせる理由もない。

## Consequences

- Loutre本体、documentation、公式サイトを同じpull requestで同期できる。
- `docs/`はGitHubと公式サイトの双方から利用される唯一のcontent sourceになる。
- HostingにNode.js、Worker、Functionsなどのruntimeを要求しない。
- GitHub Pages用のbuild成果物をrepositoryへcommitしなくてよい。
- Landing pageはdocumentation generatorのtheme制約から独立して設計できる。
- Next.jsのうちserver runtimeを必要とする機能は利用できない。
- 将来dynamic backendが必要になった場合、hosting architectureを再判断する必要がある。

## Initial scope

最初の公式サイトは、landing page、Getting Started、Architecture、examplesへの導線を成立させることを優先する。
Documentation全体の再編、全文検索、blog、dynamic playground、server-side APIはこの判断の必須要件に含めない。

## References

- [Next.js: Static Exports](https://nextjs.org/docs/app/guides/static-exports)
- [GitHub Docs: Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Docs: Configuring a publishing source for your GitHub Pages site](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
