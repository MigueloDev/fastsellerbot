export const products = [
  {
    id: 'tape-3m-33',
    name: 'Teipe 3M #33',
    description:
      'Teipe eléctrico vinil súper 33+, resistente al calor, humedad y abrasión. Ideal para empalmes y aislamiento eléctrico profesional.',
    conditions: [
      'Precio unitario: 12 USD',
      'Menos de 100 unidades: 9,28 USD cada una',
      'Mas de 100 unidades: 8,24 USD cada una',
      'Caja de 100 unidades: precio especial por volumen',
      'Mas de una Caja: Te puedo dar un mejor precio',
    ],
    active: true,
  },
  {
    id: 'tape-3m-23',
    name: 'Teipe 3M #23',
    description:
      'Teipe eléctrico vinil súper 23, uso general para instalaciones eléctricas domésticas e industriales. Excelente adherencia.',
    conditions: [
      'Minimo 40 unidades: 10 USD',
      'Caja de 100 unidades: precio especial por volumen',
      'Mas de una Caja: Te puedo dar un mejor precio',
    ],
    active: true,
  },
]

export function getActiveProducts() {
  return products.filter((p) => p.active)
}
