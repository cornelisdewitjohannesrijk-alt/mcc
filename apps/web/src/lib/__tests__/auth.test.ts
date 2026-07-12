import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { saveToken, getToken, clearToken } from '../auth'

// jsdom provides localStorage and document.cookie

describe('auth token helpers', () => {
  beforeEach(() => {
    localStorage.clear()
    // Clear cookies
    document.cookie = 'mcc_token=; path=/; max-age=0'
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('saveToken stores token in localStorage', () => {
    saveToken('my-jwt-token')
    expect(localStorage.getItem('mcc_token')).toBe('my-jwt-token')
  })

  it('saveToken stores token in cookies', () => {
    saveToken('my-jwt-token')
    expect(document.cookie).toContain('mcc_token=my-jwt-token')
  })

  it('getToken retrieves the saved token', () => {
    saveToken('abc.def.ghi')
    expect(getToken()).toBe('abc.def.ghi')
  })

  it('getToken returns null when no token is set', () => {
    expect(getToken()).toBeNull()
  })

  it('clearToken removes token from localStorage', () => {
    saveToken('some-token')
    clearToken()
    expect(localStorage.getItem('mcc_token')).toBeNull()
  })

  it('clearToken removes token from cookie', () => {
    saveToken('some-token')
    clearToken()
    // Cookie should be expired/removed
    expect(document.cookie).not.toContain('mcc_token=some-token')
  })
})
