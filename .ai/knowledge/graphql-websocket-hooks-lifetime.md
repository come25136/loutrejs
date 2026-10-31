# GraphQL WS接続フックと終了処理

## 発生条件

`graphql-ws`の接続フックをLoutre Runtimeから設定し、init待ち中に切断・drainする場合、または終了フックが例外を投げる場合。

## 原因

onConnectの未完了Promiseを受信taskとして無条件に待つと、接続終了後もsessionを解放できない。反対に、終了フックを同じabort待機で包むと、終了時にはsignalが既にabortされているためフック自身を実行できない。

また、disposeがフックの例外でrejectすると、続けて書いたoperation・iterator・taskのcleanupが飛ばされる。接続フックを追加するだけでも、終了処理全体のエラー境界を確認する必要がある。

## 安全な確認方法

接続記録の削除を実際のNode serverで確認する場合は、providerの参照を`app.close()`より前に取得する。停止後の`app.get()`は`LUTRE_APPLICATION_STATE`で拒否されるため、接続記録が残ったという誤った失敗と混同しない。誤った検証で失敗した場合は、起動中に取得したproviderを使って再実行する。

任意のpayload・Request・接続signalがDIしたフックへ届くことを確認する。onConnectを未完了にしたまま切断・drainし、待機の終了と遅いackの抑止を確認する。ack前後でonDisconnect / onCloseの呼び出し条件を分け、終了フックの例外がsessionのtraceへ記録されてもiteratorとleaseが解放されることを確認する。

## 復旧方法

onConnectの待機は接続signalで中断し、listenerをfinallyで外す。終了フックはgraphql-wsの順序でawaitする。dispose・受信task・operationのcleanupは失敗を集めて最後に報告し、途中の失敗で残りの解放を省略しない。

## 再発防止策

接続・operation・アプリの認証サービスの寿命を分離する。接続フックのために認証方式、identity、再認証頻度の規約を作らない。追加オプションは型だけでなく実行時にも接続フックへ限定し、schemaやexecutionを上書きさせない。依存ライブラリの接続フックの順序や戻り値は変更せず、そのまま適合テストする。
