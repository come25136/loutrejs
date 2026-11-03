type Position<Kind extends string> = number & {
  readonly '~loutre.source-position': Kind
}
export type SwcBytePosition = Position<'swc-byte-position'>
export type Utf8ByteOffset = Position<'utf8-offset'>
export type Utf16Index = Position<'utf16-index'>
export const swcBytePosition = (value: number): SwcBytePosition =>
  value as SwcBytePosition
export const utf8ByteOffset = (value: number): Utf8ByteOffset =>
  value as Utf8ByteOffset
export const utf16Index = (value: number): Utf16Index => value as Utf16Index
