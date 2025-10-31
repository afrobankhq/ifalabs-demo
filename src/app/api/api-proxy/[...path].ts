import { NextApiRequest, NextApiResponse } from 'next';
import httpProxyMiddleware from 'next-http-proxy-middleware';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // next-http-proxy-middleware automatically forwards all headers from the client request
  // including custom headers like X-API-Key
  // The proxy will automatically forward headers, so we don't need to manually handle them
  return httpProxyMiddleware(req, res, {
    target: 'http://146.190.186.116:8000',
    changeOrigin: true,
    pathRewrite: {
      '^/api': '/api',
    },
    secure: false,
    // Headers are automatically forwarded by next-http-proxy-middleware
  });
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
