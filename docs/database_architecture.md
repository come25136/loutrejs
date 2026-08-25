# Database / Recursive Pipeline Architecture

`@loutrejs/database`はORMを共通APIへ変換するpackageではない。Database resourceのLifecycle、
ambient transaction propagation、transactionを表すComposite Layerだけを提供する。

## DatabaseService

adapterは`DatabaseAdapterSpec`へclient型、transaction client型、物理operationごとのoption型、
capabilityを関連型として宣言し、`DatabaseService<TSpec>`を継承する。

```ts
interface AppDatabaseSpec extends DatabaseAdapterSpec {
  readonly client: AppClient
  readonly transactionClient: AppTransactionClient
  readonly beginOptions: AppBeginOptions
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: true
  }
}
```

constructorでは外部I/Oを行わない。接続は`connect()`、解放は`disconnect()`を通じてLifecycleから
実行する。`client` getterはactive transactionがあればtransaction client、なければroot clientを
返す。初期化前または解放後は`LUTRE_DB_NOT_READY`となる。

Repositoryはtransaction clientを引数で受け取らず、method実行時に`database.client`を参照する。

```ts
class UserRepository {
  constructor(
    private readonly database = inject(PRIMARY_DATABASE),
  ) {}

  create(data: CreateUser) {
    return this.database.client.user.create({ data })
  }
}
```

## Transaction Layer

`transaction()`はchild Pipelineを所有するComposite Layerを返す。`database`にはclass tokenまたは
具体的なDatabaseService型を保持するcustom tokenを指定できる。

```ts
transaction({
  database: PRIMARY_DATABASE,
  options: {
    begin: {
      isolationLevel: 'serializable',
    },
  },
  pipeline: [
    authorization,
    transaction({
      database: PRIMARY_DATABASE,
      propagation: 'savepoint',
      pipeline: [validate.body],
    }),
    http.controller,
  ],
})
```

`transaction()`が宣言するDB dependencyは`application` scopeを要求する。Graph compile時に
scope不一致があれば`LUTRE_PIPELINE_DEPENDENCY_SCOPE`となる。Graphへ出力する属性は
`propagation`とoptionの`default` / `configured`状態だけであり、raw option値は出力しない。

## Propagation

| activeな同一DB transaction | propagation | 物理operation | 使用option |
| --- | --- | --- | --- |
| なし | `required` | BEGIN | `options.begin` |
| あり | `required` | join | なし |
| なし | `savepoint` | BEGIN | `options.begin` |
| あり | `savepoint` | SAVEPOINT | `options.savepoint` |

`required` join時にinner optionをmergeしない。物理BEGINがないためinner `options.begin`の適用対象が
ない。`savepoint`でもparentがなければroot BEGINなので`options.begin`を利用する。

throwまたはPromise rejectionはrollbackする。shortCircuitは正常なLogical Resultなのでcommitする。
Pipelineのsavepoint内errorは必ずouterへ再throwされるため、outer transactionもrollbackする。
programmatic `withTransaction()`ではアプリコードが明示的にcatchして処理を継続できる。

異なるDatabaseService instanceは別々のambient stateを持つ。一方のtransaction内で別DBがcommitした
後に外側がrollbackするpartial commitは起こり得る。distributed transactionと2PCは提供しない。

## AsyncLocalStorageとDI

ambient transaction propagationにはDatabaseService instanceごとの`AsyncLocalStorage`を使う。
利用するAPIは`run()`と`getStore()`だけで、callbackは必ずnative Promiseを返す。

```text
Injection Context
└ synchronous construction中のinject()だけ

Transaction Context
└ async execution中のcurrent DB clientだけ
```

両者を統合しない。request、current user、tenantなどのexecution dataも引き続きtyped `ctx`で
伝播する。

## Recursive Pipelineの保証

Composite Layerのchild Pipelineは通常Pipelineと同じ型検証とruntime検証を受ける。

- Context provideとvalidation stateはchildから親後段へ伝播する
- terminalとshortCircuit typeはdepth-firstに検証する
- terminalは全体でexactly one、depth-first順の最後に置く
- child内linear LayerのoutboundはComposite scopeを抜ける前に完了する
- childがresultなしで終了した場合のOutcomeは`{ ok: true }`
- Scope callbackの0回実行は`LUTRE_LAYER_SCOPE_SKIPPED`
- Scope callbackの複数回実行は`LUTRE_LAYER_SCOPE_REENTRY`
- Scopeがchild errorをcatchしてもRuntimeが元errorを再throwする

HTTP Response生成、schema検証、serialization、streamingなどのProtocol Finalizationは
Pipeline execution完了後に行い、DB transactionへ含めない。

## Adapter optionとORM dependency

共通のisolation enumやtimeout fieldは作らない。Prismaの`maxWait` / `timeout`とDrizzle PostgreSQLの
`accessMode` / `deferrable`は各adapterの`beginOptions`型としてそのまま保持する。物理savepointへ
渡すoptionがなければ`savepointOptions: never`とする。

PrismaとDrizzleは`@loutrejs/database`のproduction dependencyではない。互換性は実際の現行型を
使う一時spikeと、repositoryに残すstructural type fixtureで検証する。
