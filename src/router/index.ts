import type { Router } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { reportError } from '../utils/errors'

const HomeView = () => import('../views/HomeView.vue')
const LoginView = () => import('../views/LoginView.vue')
const RegisterView = () => import('../views/RegisterView.vue')
const RouletteView = () => import('../views/RouletteView.vue')
const PlinkoView = () => import('../views/PlinkoView.vue')
const MinesView = () => import('../views/MinesView.vue')
const CasesView = () => import('../views/CasesView.vue')
const CaseDetailView = () => import('../views/CaseDetailView.vue')
const DiceView = () => import('../views/DiceView.vue')
const CoinFlipLobbyView = () => import('../views/CoinFlipLobbyView.vue')
const CoinFlipBattleView = () => import('../views/CoinFlipBattleView.vue')
const ProfileView = () => import('../views/ProfileView.vue')
const AdminView = () => import('../views/AdminView.vue')

export const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: {
      public: true,
      title: 'SCXDROP — Casino Games',
      description: 'Casino-style games: Plinko, Roulette, Mines, Dice, Coin Flip and Cases.',
    },
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: {
      public: true,
      title: 'SCXDROP — Login',
      description: 'Log in to your SCXDROP profile.',
    },
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: {
      public: true,
      title: 'SCXDROP — Register',
      description: 'Create an account for SCXDROP.',
    },
  },
  {
    path: '/roulette',
    name: 'roulette',
    component: RouletteView,
    meta: {
      public: true,
      title: 'SCXDROP — Roulette',
      description: 'European roulette: bet on numbers, colors, even/odd and ranges.',
    },
  },
  {
    path: '/mines',
    name: 'mines',
    component: MinesView,
    meta: {
      public: true,
      title: 'SCXDROP — Mines',
      description: 'Mines: open tiles, increase multiplier and cash out anytime.',
    },
  },
  {
    path: '/plinko',
    name: 'plinko',
    component: PlinkoView,
    meta: {
      public: true,
      title: 'SCXDROP — Plinko',
      description: 'Plinko: drop balls and hit multipliers based on risk and rows.',
    },
  },
  {
    path: '/dice',
    name: 'dice',
    component: DiceView,
    meta: {
      public: true,
      title: 'SCXDROP — Dice',
      description: 'Dice: choose Roll Over, chance and multiplier, then roll for the result.',
    },
  },
  {
    path: '/coinflip',
    name: 'coinflip',
    component: CoinFlipLobbyView,
    meta: {
      public: true,
      title: 'SCXDROP — Coin Flip',
      description: 'Coin flip battles: create and join open battles.',
    },
  },
  {
    path: '/coinflip/:id',
    name: 'coinflip-battle',
    component: CoinFlipBattleView,
    meta: {
      public: true,
      title: 'SCXDROP — Coin Flip Battle',
      description: 'Coin flip battle lobby and match.',
    },
  },
  {
    path: '/cases',
    name: 'cases',
    component: CasesView,
    meta: {
      public: true,
      title: 'SCXDROP — Cases',
      description: 'Open cases and get rewards. See drop chances and expected value.',
    },
  },
  {
    path: '/cases/:id',
    name: 'case',
    component: CaseDetailView,
    meta: {
      public: true,
      title: 'SCXDROP — Case',
      description: 'Case details: prizes, chances and expected value.',
    },
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfileView,
    meta: {
      requiresAuth: true,
      title: 'SCXDROP — Profile',
      description: 'Your profile and balance.',
    },
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminView,
    meta: {
      requiresAuth: true,
      title: 'SCXDROP — Admin',
      description: 'Admin panel.',
    },
  },
] as const

export function addAuthGuards(r: Router) {
  r.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.meta.requiresAuth && !auth.isAuthed) {
      return { name: 'login', query: { next: to.fullPath } }
    }
    if (to.meta.requiresAdmin && !auth.isAdmin) return { name: 'home' }
    return true
  })

  r.afterEach(() => {
    if (typeof window === 'undefined') return
    const auth = useAuthStore()
    if (auth.isAuthed) auth.fetchBalance().catch(reportError)
  })
}
