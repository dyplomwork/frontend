export class ApiError extends Error {
  status: number
  data: any
  constructor(status: number, message: string, data?: any){
    super(message)
    this.status = status
    this.data = data
  }
}

const isBrowser = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined'

const LS_TOKEN = 'casino_sim_token_v1'

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  if(!isBrowser()) throw new ApiError(0, 'API is not available during SSR/prerender')
  const token = localStorage.getItem(LS_TOKEN)
  const headers: Record<string,string> = { 'Content-Type': 'application/json', ...(opts.headers as any || {}) }
  if(token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(path, { ...opts, headers })
  const data = await res.json().catch(()=> ({}))
  if(!res.ok) throw new ApiError(res.status, data?.message || `HTTP ${res.status}`, data)
  return data as T
}
