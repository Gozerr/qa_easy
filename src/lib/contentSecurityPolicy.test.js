import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const cspTag = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?\s*>/i.exec(html)

function directives() {
  return Object.fromEntries((cspTag?.[1] ?? '').split(';').map((directive) => {
    const [name, ...values] = directive.trim().split(/\s+/)
    return [name, values]
  }))
}

describe('Content Security Policy', () => {
  it('keeps scripts on the app origin and Telegram without inline execution or eval', () => {
    const policy = directives()
    expect(cspTag, 'index.html must declare CSP').not.toBeNull()
    expect(policy['default-src']).toEqual(["'self'"])
    expect(policy['script-src']).toContain("'self'")
    expect(policy['script-src']).toContain('https://telegram.org')
    expect(policy['script-src']).not.toContain("'unsafe-inline'")
    expect(policy['script-src']).not.toContain("'unsafe-eval'")
    expect(policy['script-src']).not.toContain('*')
  })

  it('blocks plugin content and restricts base URLs and form targets', () => {
    const policy = directives()
    expect(policy['object-src']).toEqual(["'none'"])
    expect(policy['base-uri']).toEqual(["'self'"])
    expect(policy['form-action']).toEqual(["'self'"])
    expect(html).toContain('<meta name="referrer" content="strict-origin-when-cross-origin"')
  })
})
