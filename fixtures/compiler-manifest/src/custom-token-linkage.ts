import { Inject, defineModule, provide, token } from '@loutrefw/core'

interface RepositoryPort {
  readonly value: string
}

export const REPOSITORY = token<RepositoryPort>('compiler.repository')

export class CustomTokenService {
  constructor(@Inject(REPOSITORY) readonly repository: RepositoryPort) {}
}

export const CustomTokenModule = defineModule(() => ({
  providers: [
    provide(REPOSITORY).useValue({ value: 'repository' }),
    CustomTokenService,
  ],
}))
