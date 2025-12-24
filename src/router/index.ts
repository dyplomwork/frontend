import type { Router } from 'vue-router'
import { useAuthStore } from '../stores/auth'

import HomeView from '../views/HomeView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import RouletteView from '../views/RouletteView.vue'
import PlinkoView from '../views/PlinkoView.vue'
import MinesView from '../views/MinesView.vue'
import CasesView from '../views/CasesView.vue'
import CaseDetailView from '../views/CaseDetailView.vue'
import DiceView from '../views/DiceView.vue'
import ProfileView from '../views/ProfileView.vue'
import AdminView from '../views/AdminView.vue'

// NOTE: exporting routes helps SSG/prerendering.
export const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: {
      public: true,
      title: 'Casino Simulator — Plinko, Roulette, Mines, Dice, Cases',
      description: 'A lightweight casino simulator (demo) with Plinko, Roulette, Mines, Dice and Cases. Try your luck and test strategies.'
    }
  },
  {
    path: '/login',
    name: 'login',
    component: LoginView,
    meta: {
      public: true,
      title: 'Login — Casino Simulator',
      description: 'Log in to your Casino Simulator profile.'
    }
  },
  {
    path: '/register',
    name: 'register',
    component: RegisterView,
    meta: {
      public: true,
      title: 'Register — Casino Simulator',
      description: 'Create an account for Casino Simulator.'
    }
  },

  {
    path: '/roulette',
    name: 'roulette',
    component: RouletteView,
    meta: {
      public: true,
      title: 'Roulette — Casino Simulator',
      description: 'European roulette demo: bet on red/black, even/odd, ranges or a number.'
    }
  },
  {
    path: '/mines',
    name: 'mines',
    component: MinesView,
    meta: {
      public: true,
      title: 'Mines — Casino Simulator',
      description: 'Mines game demo: pick tiles, avoid mines, cash out multipliers.'
    }
  },
  {
    path: '/plinko',
    name: 'plinko',
    component: PlinkoView,
    meta: {
      public: true,
      title: 'Plinko — Casino Simulator',
      description: 'Plinko demo with multipliers and smooth ball animations.'
    }
  },
  {
    path: '/dice',
    name: 'dice',
    component: DiceView,
    meta: {
      public: true,
      title: 'Dice — Casino Simulator',
      description: 'Dice game demo: choose chance and profit, roll under or over.'
    }
  },

  {
    path: '/cases',
    name: 'cases',
    component: CasesView,
    meta: {
      public: true,
      title: 'Cases — Casino Simulator',
      description: 'Open cases and get rewards. See drop chances and expected value.'
    }
  },
  {
    path: '/cases/:id',
    name: 'case',
    component: CaseDetailView,
    meta: {
      public: true,
      title: 'Case — Casino Simulator',
      description: 'Case details: prizes, chances and expected value.'
    }
  },

  {
    path: '/profile',
    name: 'profile',
    component: ProfileView,
    meta: {
      requiresAuth: true,
      title: 'Profile — Casino Simulator',
      description: 'Your profile and balance.'
    }
  },
  {
    path: '/admin',
    name: 'admin',
    component: AdminView,
    meta: {
      requiresAdmin: true,
      title: 'Admin — Casino Simulator',
      description: 'Admin panel.'
    }
  }
] as const


export function addAuthGuards(r: Router) {
  r.beforeEach((to) => {
    const auth = useAuthStore()
    if (to.meta.requiresAuth && !auth.isAuthed) return { name: 'login' }
    if (to.meta.requiresAdmin && !auth.isAdmin) return { name: 'home' }
    return true
  })
}


