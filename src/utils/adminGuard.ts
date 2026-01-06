const ADMIN_PASSWORD = '123444'
const KEY = 'admin_authed'

export function checkAdminAccess(): boolean {
  if (sessionStorage.getItem(KEY) === '1') return true

  const pass = window.prompt('Введите пароль администратора')
  if (pass === ADMIN_PASSWORD) {
    sessionStorage.setItem(KEY, '1')
    return true
  }

  return false
}

export function clearAdminAccess() {
  sessionStorage.removeItem(KEY)
}
