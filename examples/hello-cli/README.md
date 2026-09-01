# Hello CLI Example

A minimal CLI application where the Host parses command-line arguments, binds Application Arguments, and runs a public `Task` once. Loutre itself does not interpret CLI syntax.

From this example directory, run:

```sh
npm run start
npm run start -- --name Loutre
```

Output:

```text
Hello, World!
Hello, Loutre!
```

`src/main.ts` builds the Host with Node.js `parseArgs()`, then calls `app.run(hello)` after `bootstrap({ application, arguments })`.
