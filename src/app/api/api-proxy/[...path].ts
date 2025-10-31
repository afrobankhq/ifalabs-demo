import { NextApiRequest, NextApiResponse } from 'next';
import httpProxyMiddleware from 'next-http-proxy-middleware';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {

  const path = req.url?.replace(/^\/api/, '') || '';

  return httpProxyMiddleware(req, res, {
    target: 'http://146.190.186.116:8000',
    changeOrigin: true,
    pathRewrite: {
      '^/api': '/api',
    },
    secure: false,
    // Forward all headers from the client request
    onProxyReq: (proxyReq, req) => {
      // Copy all headers from the original request
      if (req.headers) {
        Object.keys(req.headers).forEach((key) => {
          const value = req.headers[key];
          if (value && typeof value === 'string') {
            proxyReq.setHeader(key, value);
          } else if (Array.isArray(value)) {
            proxyReq.setHeader(key, value[0]);
          }
        });
      }
    },
  });
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};
