export type Brand<T, Tag extends string> = T & {
  readonly '~loutre.brand': { readonly [Key in Tag]: true }
}

export interface Descriptor<Tag extends string> {
  readonly '~loutre.descriptor': Tag
}
