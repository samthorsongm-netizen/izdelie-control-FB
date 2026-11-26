/**
 * Хранилище — Firebase. Файл остаётся прослойкой, чтобы остальной код
 * не знал, где лежат данные; при пустых переменных окружения включается демо.
 */
import * as fb from './firebase'

export const cloudEnabled = fb.firebaseEnabled
export const cloudRepo = fb.firebaseRepo
export const loadProfile = fb.loadProfile
export const signIn = fb.signIn
export const signOut = fb.signOut
export const listProfiles = fb.listProfiles
export const setRole = fb.setRole
export const createUser = fb.createUser
export const resetPeopleCache = () => {}
/** обмен структуры файлом: null в демо-режиме, чтобы не рисовать кнопки */
export const importDump = fb.firebaseEnabled ? fb.importDump : null
export const exportDump = fb.firebaseEnabled ? fb.exportDump : null
