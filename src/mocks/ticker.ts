import { listBattles } from './db'

const w: any = window

if (!w.__scx_cf_ticker) {
  w.__scx_cf_ticker = window.setInterval(() => {
    try {
      listBattles()
    } catch {
    }
  }, 250)
}
