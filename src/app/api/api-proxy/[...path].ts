import { NextApiRequest, NextApiResponse } from 'next';
import httpProxyMiddleware from 'next-http-proxy-middleware';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Get API target from environment variable, with fallback
  const apiTarget =
    process.env.PROXY_UPSTREAM_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://146.190.186.116:8000';

  // next-http-proxy-middleware automatically forwards all headers from the client request
  // including custom headers like X-API-Key
  try {
    return httpProxyMiddleware(req, res, {
      target: apiTarget,
      changeOrigin: true,
      pathRewrite: {
        '^/api': '/api',
      },
      secure: false,
      // Headers are automatically forwarded by next-http-proxy-middleware
    });
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'Unable to connect to the API server',
    });
  }
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
