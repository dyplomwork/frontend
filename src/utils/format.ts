type FormatNumberOpts = {
  decimals?: number
  trimZeros?: boolean
}

// Backward-compatible signature: formatNumber(x, 2)
export function formatNumber(value: number | string, decimals?: number): string
export function formatNumber(value: number | string, opts?: FormatNumberOpts): string
export function formatNumber(value: number | string, optsOrDecimals?: FormatNumberOpts | number): string {
  if (value === null || value === undefined) return '0'

  const num = Number(value)
  if (!Number.isFinite(num)) return '0'

  const opts: FormatNumberOpts | undefined =
    typeof optsOrDecimals === 'number' ? { decimals: optsOrDecimals } : optsOrDecimals

  const decimals =
    typeof opts?.decimals === 'number'
      ? opts.decimals
      : Number.isInteger(num)
        ? 0
        : 2

  let str = num.toFixed(decimals)

  if (opts?.trimZeros && str.includes('.')) {
    str = str.replace(/\.?0+$/, '')
  }

  const [intPart, fracPart] = str.split('.')

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  return fracPart ? `${formattedInt}.${fracPart}` : formattedInt
}

/**
 * Удобный хелпер для денег (K-валюта)
 * Пример:
 *  formatMoney(1234.5) -> "1 234.5 K"
 */
export function formatMoney(
  value: number | string,
  opts?: {
    decimals?: number
    trimZeros?: boolean
    suffix?: string
  }
): string {
  const suffix = opts?.suffix ?? ' K'
  return formatNumber(value, opts) + suffix
}