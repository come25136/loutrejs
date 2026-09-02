# Loutre Application

A Loutre Application for {{targetLabel}}.

{{developmentSection}}

## Structure

```text
src/
├ app.ts
├ app.test.ts
├ hello/
│  ├ contract.ts
│  └ controller.ts
└ main.ts
```

Keep `app.ts` focused on root Application wiring. Group application code by feature or integration as the project grows.

## Verify

```sh
{{verifyCommand}}
```

{{deploymentSection}}
