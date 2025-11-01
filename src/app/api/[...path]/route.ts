import { NextRequest, NextResponse } from 'next/server'

/**
 * Determine the upstream API base URL.
 * Priority: PROXY_UPSTREAM_URL > NEXT_PUBLIC_API_URL > fallback
 */
const candidateUpstream =
  process.env.PROXY_UPSTREAM_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'https://api.ifalabs.com'

// Ensure a clean, absolute base (prevent recursion)
const isRelative = candidateUpstream.startsWith('/')
const UPSTREAM_BASE = (isRelative || !candidateUpstream
  ? 'https://api.ifalabs.com'
  : candidateUpstream
).replace(/\/$/, '')

// Optional prefix override (default "api")
const API_PREFIX = process.env.PROXY_API_PREFIX || 'api'

// Log proxy config (only during development)
if (process.env.NODE_ENV !== 'production') {
  console.log('[proxy] Configuration:', {
    UPSTREAM_BASE,
    PROXY_UPSTREAM_URL: process.env.PROXY_UPSTREAM_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    API_PREFIX,
  })
}

/**
 * Universal proxy handler for all HTTP methods
 */
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params
  const targetPath = params?.path?.join('/') || ''
  const upstreamPath = targetPath ? `${API_PREFIX}/${targetPath}` : API_PREFIX
  const url = `${UPSTREAM_BASE}/${upstreamPath}${request.nextUrl.search}`

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[proxy →]', {
      incomingPath: request.url,
      upstreamUrl: url,
      method: request.method,
      hasApiKey: request.headers.get('X-API-Key') ? 'Yes' : 'No',
    })
  }

  // Forward headers (omit hop-by-hop ones)
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (['host', 'origin', 'connection', 'transfer-encoding'].includes(lower))
      return
    headers.set(key, value)
  })

  // Prepare fetch options
  const init: RequestInit = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method)
      ? undefined
      : await request.text(),
    redirect: 'follow',
  }

  // Timeout protection (15 seconds)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  init.signal = controller.signal

  try {
    const upstreamResponse = await fetch(url, init)
    clearTimeout(timeout)

    // Stream response to avoid buffering large payloads
    const response = new NextResponse(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    })

    if (process.env.NODE_ENV !== 'production') {
      console.debug('[proxy ←]', {
        url,
        status: upstreamResponse.status,
        contentType: upstreamResponse.headers.get('content-type'),
      })
    }

    return response
  } catch (error) {
    clearTimeout(timeout)
    const message = (error as Error)?.message || 'Unknown error'

    console.error('[proxy] error', {
      url,
      method: request.method,
      error: message,
      upstreamBase: UPSTREAM_BASE,
      targetPath,
      timestamp: new Date().toISOString(),
    })

    const responseBody =
      process.env.NODE_ENV !== 'production'
        ? {
            message: 'Proxy request failed',
            error: message,
            details: {
              url,
              method: request.method,
              upstreamBase: UPSTREAM_BASE,
              targetPath,
            },
            hint: 'Check PROXY_UPSTREAM_URL and backend availability',
          }
        : {
            message: 'Service temporarily unavailable',
            error: 'Unable to connect to backend service',
          }

    return NextResponse.json(responseBody, { status: 502 })
  }
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as DELETE,
  handle as PATCH,
  handle as OPTIONS,
  handle as HEAD,
}
