import { defineModule, provide, token } from '@loutrejs/core'

const DIRECT = token<string>('duplicate-source-provider-direct')
const IMPORTED = token<string>('duplicate-source-provider-imported')

export const DirectModule = defineModule(() => ({
  providers: [
    provide(DIRECT).useValue('first'),
    provide(DIRECT).useValue('second'),
  ],
}))

const FirstModule = defineModule(() => ({
  providers: [provide(IMPORTED).useValue('first')],
}))

const SecondModule = defineModule(() => ({
  providers: [provide(IMPORTED).useValue('second')],
}))

export const ImportedRootModule = defineModule(() => ({
  imports: [FirstModule(), SecondModule()],
}))
