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
const CoinFlipView = () => import('../views/CoinFlipView.vue')
const ProfileView = () => import('../views/ProfileView.vue')
const AdminView = () => import('../views/AdminView.vue')

export const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: {
      public: true,
      title: 'Casino Simulator — Plinko, Roulette, Mines, Dice, Cases',
      description:
        'A lightweight casino simulator (demo) with Plinko, Roulette, Mines, Dice and Cases. Try your luck and test strategies.',
    },
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: {
      public: true,
      title: 'Login — Casino Simulator',
      description: 'Log in to your Casino Simulator profile.',
    },
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: {
      public: true,
      title: 'Register — Casino Simulator',
      description: 'Create an account for Casino Simulator.',
    },
  },
  {
    path: '/roulette',
    name: 'roulette',
    component: RouletteView,
    meta: {
      public: true,
      title: 'Roulette — Casino Simulator',
      description: 'European roulette demo: bet on red/black, even/odd, ranges or a number.',
    },
  },
  {
    path: '/mines',
    name: 'mines',
    component: MinesView,
    meta: {
      public: true,
      title: 'Mines — Casino Simulator',
      description: 'Mines game demo: pick tiles, avoid mines, cash out multipliers.',
    },
  },
  {
    path: '/plinko',
    name: 'plinko',
    component: PlinkoView,
    meta: {
      public: true,
      title: 'Plinko — Casino Simulator',
      description: 'Plinko demo with multipliers and smooth ball animations.',
    },
  },
  {
    path: '/dice',
    name: 'dice',
    component: DiceView,
    meta: {
      public: true,
      title: 'Dice — Casino Simulator',
      description: 'Dice game demo: choose chance and profit, roll under or over.',
    },
  },
  {
    path: '/coinflip',
    name: 'coinflip',
    component: CoinFlipView,
    meta: {
      public: true,
      title: 'Coin Flip — Casino Simulator',
      description: 'Coin flip battles: create, join and approve the result.',
    },
  },
  {
    path: '/cases',
    name: 'cases',
    component: CasesView,
    meta: {
      public: true,
      title: 'Cases — Casino Simulator',
      description: 'Open cases and get rewards. See drop chances and expected value.',
    },
  },
  {
    path: '/cases/:id',
    name: 'case',
    component: CaseDetailView,
    meta: {
      public: true,
      title: 'Case — Casino Simulator',
      description: 'Case details: prizes, chances and expected value.',
    },
  },
  {
    path: '/profile',
    name: 'profile',
    component: ProfileView,
    meta: {
      requiresAuth: true,
      title: 'Profile — Casino Simulator',
      description: 'Your profile and balance.',
    },
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminView,
    meta: {
      requiresAuth: true,
      requiresAdmin: true,
      title: 'Admin — Casino Simulator',
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
