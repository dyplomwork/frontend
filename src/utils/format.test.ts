import { describe, it, expect } from 'vitest'
import { formatNumber, formatMoney } from './format'

describe('formatNumber', () => {
  describe('базові числа', () => {
    it('форматує ціле число без десяткових', () => {
      expect(formatNumber(1000)).toBe('1 000')
    })

    it('форматує число з рядка', () => {
      expect(formatNumber('5000')).toBe('5 000')
    })

    it('форматує дрібне число з 2 знаками за замовчуванням', () => {
      expect(formatNumber(3.14159)).toBe('3.14')
    })

    it('повертає "0" для null/undefined', () => {
      expect(formatNumber(null as any)).toBe('0')
      expect(formatNumber(undefined as any)).toBe('0')
    })

    it('повертає "0" для NaN та Infinity', () => {
      expect(formatNumber(NaN)).toBe('0')
      expect(formatNumber(Infinity)).toBe('0')
    })
  })

  describe('опція decimals', () => {
    it('форматує з вказаною кількістю знаків (legacy — число)', () => {
      expect(formatNumber(1.5, 4)).toBe('1.5000')
    })

    it('форматує з нульовими знаками', () => {
      expect(formatNumber(99.99, 0)).toBe('100')
    })

    it('форматує через об\'єкт opts.decimals', () => {
      expect(formatNumber(1234.5678, { decimals: 3 })).toBe('1 234.568')
    })
  })

  describe('опція trimZeros', () => {
    it('обрізає кінцеві нулі', () => {
      expect(formatNumber(1.500, { decimals: 3, trimZeros: true })).toBe('1.5')
    })

    it('обрізає до цілого якщо всі нулі', () => {
      expect(formatNumber(5.000, { decimals: 3, trimZeros: true })).toBe('5')
    })

    it('не обрізає якщо trimZeros не вказано', () => {
      expect(formatNumber(1.500, { decimals: 3 })).toBe('1.500')
    })
  })

  describe('розділення тисяч пробілами', () => {
    it('форматує 1000000', () => {
      expect(formatNumber(1000000)).toBe('1 000 000')
    })

    it('форматує 999', () => {
      expect(formatNumber(999)).toBe('999')
    })

    it('форматує від\'ємне число', () => {
      expect(formatNumber(-1500)).toBe('-1 500')
    })
  })
})

describe('formatMoney', () => {
  it('додає суфікс " K" за замовчуванням', () => {
    expect(formatMoney(1000)).toBe('1 000 K')
  })

  it('підтримує кастомний суфікс', () => {
    expect(formatMoney(500, { suffix: ' coins' })).toBe('500 coins')
  })

  it('передає decimals у formatNumber', () => {
    expect(formatMoney(1.234, { decimals: 1 })).toBe('1.2 K')
  })

  it('trimZeros працює разом з formatMoney', () => {
    expect(formatMoney(2.500, { decimals: 3, trimZeros: true })).toBe('2.5 K')
  })
})
