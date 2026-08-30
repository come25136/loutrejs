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
