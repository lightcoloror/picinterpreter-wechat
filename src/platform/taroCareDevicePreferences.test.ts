import { beforeEach, test, expect, vi } from 'vitest'
const h=vi.hoisted(()=>({values:new Map<string,unknown>(),session:null as null|{user:{id:string}},events:vi.fn()}))
vi.mock('@tarojs/taro',()=>({default:{getStorageSync:(k:string)=>h.values.get(k),setStorageSync:(k:string,v:unknown)=>h.values.set(k,v),eventCenter:{trigger:h.events}}}))
vi.mock('./taroCboardAccountPort',()=>({taroCboardSessionStore:{load:()=>h.session}}))
import { careScopedKey } from './taroCareContext'
import { taroCommunicationPreferencesStore as store } from './taroCommunicationPreferencesStore'
beforeEach(()=>{vi.stubEnv('TARO_APP_CARE_COLLABORATION','true');h.values.clear();h.events.mockClear();h.session={user:{id:'synthetic-account'}};h.values.set('care-selection-v1:synthetic-account',{id:'synthetic-one',familyId:'synthetic-family',permissions:['read']})})
test('read-only member can change local rate without changing family defaults or queueing a write',()=>{
 const defaults={speechRate:0.7,fontSize:'large',cardDensity:3};h.values.set(careScopedKey('care-patient-defaults'),defaults)
 store.update({speechRate:1.3});expect(store.load().speechRate).toBe(1.3)
 expect(h.values.get(careScopedKey('care-patient-defaults'))).toEqual(defaults)
 expect(h.values.has(careScopedKey('care-pending-speechRate'))).toBe(false);expect(h.events).not.toHaveBeenCalled()
 h.values.set('care-selection-v1:synthetic-account',{id:'synthetic-two',familyId:'synthetic-family',permissions:['read']})
 expect(store.load().speechRate).toBe(1)
 h.values.set('care-selection-v1:synthetic-account',{id:'synthetic-one',familyId:'synthetic-family',permissions:['read']})
 expect(store.load().speechRate).toBe(1.3)
})
test('legacy explicitly queued rate is retained unchanged',()=>{
 h.values.set(careScopedKey('cboard_communication_preferences'),JSON.stringify({speechRate:1.3}))
 h.values.set(careScopedKey('care-pending-speechRate'),JSON.stringify(1.3));expect(store.load().speechRate).toBe(1.3)
 store.update({fontSize:'extra-large'});expect(h.values.get(careScopedKey('care-pending-speechRate'))).toBe(JSON.stringify(1.3))
})
