import type { FieldSelection } from '@loutrejs/graphql/data'

export interface Category {
  readonly id: string
  readonly name: string
}
export interface Product {
  readonly id: string
  readonly name: string
  readonly category: Category
}
export interface Account {
  readonly id: string
  readonly name: string
}
export interface Customer {
  readonly id: string
  readonly account: Account
}
export interface OrderItem {
  readonly id: string
  readonly quantity: number
  readonly productId: string
  readonly revision: number
  readonly tenant: string
  readonly product?: Product
}
export interface Order {
  readonly id: string
  readonly customerId: string
  readonly items: readonly OrderItem[]
  readonly customer?: Customer
}
export interface OrderConnection {
  readonly totalCount: number
  readonly pageInfo: {
    readonly hasPreviousPage: boolean
    readonly hasNextPage: boolean
  }
  readonly edges: readonly Order[]
}
export class CommerceService {
  #productBatchCount = 0
  get productBatchCount() {
    return this.#productBatchCount
  }
  search(input: {
    filter: { readonly customerId?: string | null }
    pagination: { readonly offset: number; readonly limit: number }
    strategy: 'EAGER' | 'LAZY' | 'HYBRID'
    selection: FieldSelection
    signal: AbortSignal
  }): OrderConnection {
    input.signal.throwIfAborted()
    const { offset, limit } = input.pagination
    if (offset < 0 || limit < 1 || limit > 100)
      throw new Error('offsetは0以上、limitは1から100にしてください。')
    const orders: Order[] = Array.from({ length: 150 }, (_, index) => ({
      id: String(index + 1),
      customerId: `customer-${index % 10}`,
      items: Array.from({ length: 2 }, (_entry, item) => ({
        id: `${index + 1}-${item}`,
        quantity: item + 1,
        productId: `product-${(index * 2 + item) % 20}`,
        tenant: 'demo',
        revision: 1,
      })),
    })).filter(
      (order) =>
        !input.filter.customerId ||
        order.customerId === input.filter.customerId,
    )
    const page = orders.slice(offset, offset + limit)
    const selected =
      input.selection.children.find((field) => field.fieldName === 'edges')
        ?.children ?? []
    const customerSelected = selected.some(
      (field) => field.fieldName === 'customer',
    )
    const productSelected =
      selected
        .find((field) => field.fieldName === 'items')
        ?.children.some((field) => field.fieldName === 'product') ?? false
    return {
      totalCount: orders.length,
      pageInfo: {
        hasPreviousPage: offset > 0,
        hasNextPage: offset + page.length < orders.length,
      },
      edges: page.map((order) => ({
        ...order,
        ...(customerSelected && input.strategy !== 'LAZY'
          ? { customer: this.customer(order.customerId) }
          : {}),
        items: order.items.map((item) => ({
          ...item,
          ...(productSelected && input.strategy === 'EAGER'
            ? { product: this.product(item) }
            : {}),
        })),
      })),
    }
  }
  customer(id: string): Customer {
    return { id, account: { id: `account-${id}`, name: id } }
  }
  product(item: OrderItem): Product {
    if (item.tenant !== 'demo')
      throw new Error('このtenantの商品は取得できません。')
    return {
      id: item.productId,
      name: `${item.productId}@${item.revision}`,
      category: { id: 'category-1', name: '日用品' },
    }
  }
  findProducts(
    items: readonly OrderItem[],
    signal: AbortSignal,
  ): readonly Product[] {
    signal.throwIfAborted()
    this.#productBatchCount++
    const byKey = new Map<string, Product>()
    return items.map((item) => {
      const key = JSON.stringify([item.tenant, item.revision, item.productId])
      let product = byKey.get(key)
      if (!product) {
        product = this.product(item)
        byKey.set(key, product)
      }
      return product
    })
  }
}
