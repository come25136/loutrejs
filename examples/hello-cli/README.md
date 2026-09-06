# Hello CLI Example

A minimal CLI application where the Host parses command-line arguments, binds Application Arguments, and runs a public Task once. Loutre itself does not interpret CLI syntax.

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

`src/main.ts` parses arguments with Node.js `parseArgs()`, starts the Application with `bootstrapApplication({ application, arguments })`, then invokes the Task through the Tasks Extension Host API with `app.tasks.run(hello)`.
