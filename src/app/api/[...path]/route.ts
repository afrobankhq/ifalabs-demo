import { NextRequest, NextResponse } from 'next/server'

// ------------------------------
// Configuration
// ------------------------------
const DEFAULT_UPSTREAM = 'https://api.ifalabs.com'
const CACHE_TTL = 15 * 1000 // 15 seconds cache per URL
const cache = new Map<string, { data: ArrayBuffer; ts: number; status: number; headers: Record<string, string> }>()

// Resolve base URL from environment
const candidateUpstream =
  process.env.PROXY_UPSTREAM_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  DEFAULT_UPSTREAM

const UPSTREAM_BASE = candidateUpstream.startsWith('/')
  ? DEFAULT_UPSTREAM
  : candidateUpstream.replace(/\/$/, '')

if (process.env.NODE_ENV !== 'production') {
  console.log('[proxy] Using upstream base:', UPSTREAM_BASE)
}

// ------------------------------
// Handler
// ------------------------------
async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const params = await context.params
  const targetPath = params?.path?.join('/') || ''
  const upstreamPath = `api/${targetPath}`
  const url = `${UPSTREAM_BASE}/${upstreamPath}${request.nextUrl.search}`

  const cacheKey = `${request.method}:${url}`
  const now = Date.now()

  // ------------------------------
  // Serve from cache if valid
  // ------------------------------
  const cached = cache.get(cacheKey)
  if (cached && now - cached.ts < CACHE_TTL) {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[proxy] cache hit →', cacheKey)
    }
    return new NextResponse(cached.data, {
      status: cached.status,
      headers: {
        ...cached.headers,
        'x-cache': 'HIT',
      },
    })
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[proxy] fetch →', { url, method: request.method })
  }

  // Clone request headers except hop-by-hop
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    if (['host', 'origin', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) return
    headers.set(key, value)
  })

  const init: RequestInit = {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    redirect: 'follow',
  }

  try {
    const upstreamResponse = await fetch(url, init)
    const data = await upstreamResponse.arrayBuffer()

    const responseHeaders: Record<string, string> = {}
    upstreamResponse.headers.forEach((v, k) => {
      if (['transfer-encoding', 'connection'].includes(k.toLowerCase())) return
      responseHeaders[k] = v
    })

    // Cache successful (2xx) responses for GET only
    if (request.method === 'GET' && upstreamResponse.ok) {
      cache.set(cacheKey, {
        data,
        ts: now,
        status: upstreamResponse.status,
        headers: responseHeaders,
      })
    }

    return new NextResponse(data, {
      status: upstreamResponse.status,
      headers: {
        ...responseHeaders,
        'x-cache': 'MISS',
      },
    })
  } catch (error) {
    const message = (error as Error)?.message || 'Unknown error'
    const details = {
      url,
      method: request.method,
      error: message,
      upstreamBase: UPSTREAM_BASE,
      ts: new Date().toISOString(),
    }

    console.error('[proxy] error', details)

    const body =
      process.env.NODE_ENV !== 'production'
        ? {
            message: 'Proxy request failed',
            details,
            hint: 'Check that PROXY_UPSTREAM_URL is reachable or increase cache TTL',
          }
        : { message: 'Service temporarily unavailable' }

    return NextResponse.json(body, { status: 502 })
  }
}

// ------------------------------
// Export all methods
// ------------------------------
export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as DELETE,
  handle as PATCH,
  handle as OPTIONS,
  handle as HEAD,
}
