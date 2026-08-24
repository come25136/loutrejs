export class Repository {
  readonly value = 'repository'
}

export class Service {
  constructor(readonly repository: Repository) {}
}
