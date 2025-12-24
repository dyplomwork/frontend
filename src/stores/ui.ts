import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    soundOn: true as boolean,
  }),
  actions: {
    init(){
      try{
        const v = localStorage.getItem('ganza_soundOn')
        if(v !== null) this.soundOn = v === '1'
      }catch{}
    },
    toggleSound(){
      this.soundOn = !this.soundOn
      try{ localStorage.setItem('ganza_soundOn', this.soundOn ? '1' : '0') }catch{}
    },
    setSound(on: boolean){
      this.soundOn = !!on
      try{ localStorage.setItem('ganza_soundOn', this.soundOn ? '1' : '0') }catch{}
    }
  }
})
