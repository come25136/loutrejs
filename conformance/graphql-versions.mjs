import {
  mkdtemp,
  mkdir,
  writeFile,
  rm,
  readFile,
  copyFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const tarballs = resolve(process.argv[2] ?? 'dist/package-tarballs')
const packageVersion = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
).version
const versions = (process.argv[3] ?? '16.14.2,17.0.2').split(',')
const directory = await mkdtemp(join(tmpdir(), 'loutre-graphql-versions-'))
try {
  for (const version of versions) {
    const cwd = join(directory, version)
    await mkdir(join(cwd, 'src'), { recursive: true })
    const dependencies = Object.fromEntries(
      ['cli', 'graphql', 'loutre', 'node'].map((name) => [
        `@loutrejs/${name}`,
        `file:${join(tarballs, `loutrejs-${name}-${packageVersion}.tgz`)}`,
      ]),
    )
    dependencies.graphql = version
    dependencies.typescript = '7.0.2'
    dependencies['@types/node'] = '26.6.2'
    dependencies['@graphql-typed-document-node/core'] = '3.2.0'
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ type: 'module', private: true, dependencies }),
    )
    await writeFile(
      join(cwd, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2024',
          module: 'NodeNext',
          strict: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['src/**/*.ts'],
      }),
    )
    await writeFile(
      join(cwd, 'schema.graphql'),
      `scalar DateTime
      enum Role { MEMBER ADMIN }
      input Options { at:DateTime = "2026-01-01", role:Role = ADMIN }
      type Child { value:Int! } type Parent { id:ID!, child:Child! }
      type Query { parents:[Parent!]!, check(options:Options! = {}):String!, cleanups:Int! }
      type Mutation { change:Parent! }
      type Subscription { ticks:Parent! }`,
    )
    await writeFile(
      join(cwd, 'operation.graphql'),
      'query Parents { parents { child { value } } }',
    )
    await writeFile(
      join(cwd, 'config.ts'),
      `export default { targets: {
      server: { kind:'server',schema:['schema.graphql'],mappers:{Parent:'../context.js#Parent'},scalars:{DateTime:'Date'},output:'src/generated' },
      client: { kind:'client',schema:['schema.graphql'],documents:['operation.graphql'],scalars:{DateTime:'string'},output:'src/client.ts' }
    } }`,
    )
    await writeFile(
      join(cwd, 'src/context.ts'),
      `export interface Parent { id:string } export interface AppContext { signal:AbortSignal; state:{ parent:Parent; revision:number; calls:number; cleanups:number } }`,
    )
    await writeFile(
      join(cwd, 'src/resolvers.ts'),
      `import { GraphQLScalarType } from 'graphql'
      import type { Resolvers } from './generated/types.js'
      import type { AppContext } from './context.js'
      const enumResolvers = { Role: { MEMBER:1, ADMIN:2 } }
      export const resolvers = {
        ...enumResolvers,
        DateTime: new GraphQLScalarType({name:'DateTime',serialize: value => (value as Date).toISOString(),parseValue:value=>new Date(String(value))}),
        Query: {
          parents: (_parent,_args,context)=>[context.state.parent,context.state.parent],
          check: (_parent,{options})=>options.at!.toISOString()+':'+options.role,
          cleanups: (_parent,_args,context)=>context.state.cleanups,
        },
        Parent: { child: {requires:['id'],load:(parents,{context,signal})=>{signal.throwIfAborted();context.state.calls++;return parents.map(()=>({value:context.state.revision}))}} },
        Mutation: { change: (_parent,_args,context)=>{context.state.revision++;return context.state.parent} },
        Subscription: { ticks: {
          subscribe: async function*(_parent,_args,context) {
            try {
              context.state.revision++;yield context.state.parent
              context.state.revision++;yield context.state.parent
              if(!context.signal.aborted) await new Promise<void>(resolve=>context.signal.addEventListener('abort',()=>resolve(),{once:true}))
            } finally {context.state.cleanups++}
          },
          resolve: (value: import('./context.js').Parent)=>value,
        } },
      } satisfies Resolvers<AppContext>`,
    )
    await writeFile(
      join(cwd, 'src/app.ts'),
      `import { defineApplication,defineModule } from '@loutrejs/loutre'
      import { graphql } from '@loutrejs/graphql'
      import { bindManifest } from './generated/bindings.js'
      import { schemaDocument } from '../shared-contract/schema-ast.js'
      import type { AppContext } from './context.js'
      import { resolvers } from './resolvers.js'
      const manifest = bindManifest<AppContext>({ schemaDocument, resolvers })
      export const state={parent:{id:'same'},revision:0,calls:0,cleanups:0}
      const Module=defineModule(()=>({executions:[graphql.endpoint({name:'Compatibility',path:'/graphql',manifest,transports:{http:true,websocket:true},factory:()=>({context:({signal})=>({signal,state})})})]}))
      export default defineApplication({modules:[Module()]})`,
    )
    await writeFile(
      join(cwd, 'verify.mjs'),
      `import assert from 'node:assert/strict'
      import {version} from 'graphql'
      import {nodeRuntime} from '@loutrejs/node'
      import {createClient} from 'graphql-ws'
      import definition from './built/application.mjs'
      assert.equal(version,${JSON.stringify(version)})
      const app=await nodeRuntime.create({application:definition})
      const {server}=await app.serve({port:0,hostname:'127.0.0.1',shutdownHooks:false})
      const url='http://127.0.0.1:'+server.address().port+'/graphql'
      const client=createClient({url:url.replace('http:','ws:'),retryAttempts:0})
      const request=query=>fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query})}).then(value=>value.json())
      const operation=query=>new Promise((resolve,reject)=>{let value;client.subscribe({query},{next:result=>{value=result},error:reject,complete:()=>resolve(value)})})
      try {
        assert.deepEqual(await request('{check}'),{data:{check:'2026-01-01T00:00:00.000Z:2'}})
        assert.deepEqual(await request('{parents{child{value}}}'),{data:{parents:[{child:{value:0}},{child:{value:0}}]}})
        assert.deepEqual(await operation('{parents{child{value}}}'),{data:{parents:[{child:{value:0}},{child:{value:0}}]}})
        assert.deepEqual(await request('mutation{a:change{child{value}} b:change{child{value}}}'),{data:{a:{child:{value:1}},b:{child:{value:2}}}})
        const events=[]
        let stop
        const received=new Promise((resolve,reject)=>{
          stop=client.subscribe({query:'subscription{ticks{child{value}}}'},{next:result=>{events.push(result);if(events.length===2)resolve()},error:reject,complete:()=>{}})
        })
        await Promise.race([received,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Subscription timeout')),5000);timer.unref()})])
        assert.deepEqual(events,[{data:{ticks:{child:{value:3}}}},{data:{ticks:{child:{value:4}}}}])
        stop()
        for(let attempt=0;attempt<100;attempt++) {if((await request('{cleanups}')).data.cleanups===1)break;await new Promise(resolve=>setTimeout(resolve,10))}
        assert.equal((await request('{cleanups}')).data.cleanups,1)
        console.log('GraphQL '+version+' Manifest / Scalar / Batch / HTTP / WS / Mutation / Subscription Event Scope: passed')
      } finally {await client.dispose();await app.close()}`,
    )
    try {
      await run(
        'npm',
        ['install', '--ignore-scripts', '--no-audit', '--no-fund'],
        { cwd, timeout: 180000, maxBuffer: 8 * 1024 * 1024 },
      )
      const cli = join(cwd, 'node_modules/@loutrejs/cli/bin/loutre.js')
      await run(
        process.execPath,
        [cli, 'graphql', 'generate', '--config', 'config.ts'],
        { cwd },
      )
      await run(
        process.execPath,
        [cli, 'graphql', 'generate', '--config', 'config.ts', '--check'],
        { cwd },
      )
      await mkdir(join(cwd, 'shared-contract'))
      await copyFile(
        join(cwd, 'src/generated/schema-ast.ts'),
        join(cwd, 'shared-contract/schema-ast.ts'),
      )
      await run(join(cwd, 'node_modules/.bin/tsc'), [], { cwd })
      await run(
        process.execPath,
        [cli, 'build', 'src/app.ts', '--out-dir', 'built'],
        { cwd, maxBuffer: 8 * 1024 * 1024 },
      )
      const result = await run(process.execPath, ['verify.mjs'], {
        cwd,
        timeout: 30000,
      })
      process.stdout.write(result.stdout)
    } catch (error) {
      throw new Error(
        `GraphQL ${version}: ${error.stderr || error.stdout || error.message}`,
        {
          cause: error,
        },
      )
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true })
}
