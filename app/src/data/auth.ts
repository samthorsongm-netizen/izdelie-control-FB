/**
 * Выбор хранилища: Firebase (если заданы его переменные) или Supabase.
 * Приложение импортирует только этот файл — остальной код не знает, что внутри.
 */
import * as sb from './supabase'
import * as fb from './firebase'

const useFirebase = fb.firebaseEnabled

export const cloudEnabled = useFirebase || sb.cloudEnabled
export const cloudRepo = useFirebase ? fb.firebaseRepo : sb.cloudRepo
export const loadProfile = useFirebase ? fb.loadProfile : sb.loadProfile
export const signIn = useFirebase ? fb.signIn : sb.signIn
export const signOut = useFirebase ? fb.signOut : sb.signOut
export const listProfiles = useFirebase ? fb.listProfiles : sb.listProfiles
export const setRole = useFirebase ? fb.setRole : sb.setRole
export const createUser = useFirebase ? fb.createUser : sb.createUser
export const resetPeopleCache = useFirebase ? () => {} : sb.resetPeopleCache
