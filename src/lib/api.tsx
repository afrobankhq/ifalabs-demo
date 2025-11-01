import axios, { AxiosInstance } from 'axios';
import { tokenList } from '@/lib/tokens';
import { StaticImageData } from 'next/image';

const API_BASE_URL = '/api';

export interface Asset {
  asset_id: string;
  asset: string;
  address?: string;
}

export interface PriceChange {
  period: string;
  change: number;
  change_pct: number;
  from_price: number;
  to_price: number;
  from_time: string;
  to_time: string;
}

export interface PriceResponse {
  id: string;
  assetID: string;
  value: number;
  expo: number;
  timestamp: string;
  source: string;
  req_hash: string;
  req_url: string;
  is_aggr: boolean;
  connected_price_ids: any;
  price_changes: PriceChange[];
}

export interface TokenPrice {
  symbol: string;
  price: number;
  change_7d?: number;
  change_7d_pct?: number;
  icon: string | StaticImageData;
}

class ApiService {
  private static instance: ApiService;
  private assetCache: Asset[] | null = null;
  private axiosInstance: AxiosInstance;

  private constructor() {
    // Create axios instance with interceptor to add API key headers
    this.axiosInstance = axios.create({
      baseURL: API_BASE_URL,
    });

    // Add request interceptor to include API key for Oracle Engine endpoints
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Check if this is an Oracle Engine endpoint that requires API key
        const isOraclePriceEndpoint =
          config.url?.includes('/prices/') || config.url?.includes('/assets');
        
        if (isOraclePriceEndpoint && typeof window !== 'undefined') {
          const apiKey = this.getApiKey();
          if (apiKey && config.headers) {
            // Set the X-API-Key header using common property access
            // This works with both plain objects and AxiosHeaders instances
            if ('set' in config.headers && typeof config.headers.set === 'function') {
              // AxiosHeaders instance
              config.headers.set('X-API-Key', apiKey);
            } else {
              // Plain object
              (config.headers as Record<string, string>)['X-API-Key'] = apiKey;
            }
          }
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  public static getInstance(): ApiService {
    if (!ApiService.instance) {
      ApiService.instance = new ApiService();
    }
    return ApiService.instance;
  }

  // API Key management methods
  private getApiKey(): string | null {
    if (typeof window === 'undefined') return null;
    
    // First check localStorage (user-set API key takes priority)
    const localKey = localStorage.getItem('oracle_api_key');
    if (localKey) {
      return localKey;
    }
    
    // Fall back to environment variable (default/fallback API key)
    if (process.env.NEXT_PUBLIC_ORACLE_API_KEY) {
      return process.env.NEXT_PUBLIC_ORACLE_API_KEY;
    }
    
    return null;
  }

  public setApiKey(apiKey: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('oracle_api_key', apiKey);
  }

  public removeApiKey(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('oracle_api_key');
  }

  public hasApiKey(): boolean {
    const key = this.getApiKey();
    return !!key && key.trim() !== '';
  }
  
  // Check if API key comes from environment variable
  public isApiKeyFromEnv(): boolean {
    if (typeof window === 'undefined') return false;
    return !!process.env.NEXT_PUBLIC_ORACLE_API_KEY;
  }

  async getAssets(): Promise<Asset[]> {
    if (this.assetCache) {
      return this.assetCache;
    }

    try {
      const response = await this.axiosInstance.get<Asset[]>('/assets');
      this.assetCache = response.data;
      return response.data;
    } catch (error) {
      console.error('Error fetching assets:', error);
      throw error;
    }
  }

  async getAssetIdBySymbol(symbol: string): Promise<string | null> {
    const assets = await this.getAssets();
    const asset = assets.find((a) => a.asset === symbol);
    return asset ? asset.asset_id : null;
  }

  // Helper method to calculate the actual price from value and expo
  private calculatePrice(value: number, expo: number): number {
    return value * Math.pow(10, expo);
  }

  async getLatestPrice(
    assetId: string,
  ): Promise<{ price: number; change_7d?: number; change_7d_pct?: number }> {
    try {
      console.log(`Fetching price for assetId: ${assetId}`);
      console.log(`URL: ${API_BASE_URL}/prices/last?asset=${assetId}`);
      const apiKey = this.getApiKey();
      if (apiKey) {
        console.log('Using API key for authentication');
      }

      const response = await this.axiosInstance.get<PriceResponse>(
        `/prices/last?asset=${assetId}`,
      );

      console.log('Raw API response:', response.data);

      // The response is directly the price data, not wrapped in an object with assetId as key
      const priceData = response.data;
      if (!priceData || !priceData.value) {
        console.warn(`No price data found for assetId: ${assetId}`);
        return { price: 0 };
      }

      const price = this.calculatePrice(priceData.value, priceData.expo);
      console.log(`Calculated price for ${assetId}: ${price}`);

      // Extract 7-day change data if available
      const change7d = priceData.price_changes?.find(
        (change) => change.period === '7d',
      );

      return {
        price,
        change_7d: change7d?.change,
        change_7d_pct: change7d?.change_pct,
      };
    } catch (error) {
      console.error(`Error fetching price for asset ${assetId}:`, error);
      if (axios.isAxiosError(error)) {
        console.error('Response status:', error.response?.status);
        console.error('Response data:', error.response?.data);
        console.error('Request URL:', error.config?.url);
      }
      // Return default values instead of throwing
      return { price: 0 };
    }
  }

  async getAllTokenPrices(): Promise<TokenPrice[]> {
    const assets = await this.getAssets();
    console.log('Available assets:', assets);

    const tokenSymbols = assets.map((asset) => {
      const symbol = asset.asset.split('/')[0];
      return {
        symbol: asset.asset,
        assetId: asset.asset_id,
        token: symbol,
      };
    });

    console.log('Token symbols to fetch:', tokenSymbols);

    const pricePromises = tokenSymbols.map(
      async ({ symbol, assetId, token }) => {
        const { price, change_7d, change_7d_pct } = await this.getLatestPrice(
          assetId,
        );
        return {
          symbol,
          price,
          change_7d,
          change_7d_pct,
          icon: this.getTokenIcon(token),
        };
      },
    );

    return Promise.all(pricePromises);
  }

  private getTokenIcon(token: string): StaticImageData {
   
    return tokenList[token]?.icon || '/images/tokens/eth.svg';
  }

  // Helper method to get price for specific token pair
  async getPriceForPair(
    fromToken: string,
    toToken: string,
  ): Promise<number | null> {
    try {
      const fromAssetId = await this.getAssetIdBySymbol(`${fromToken}/USD`);
      const toAssetId = await this.getAssetIdBySymbol(`${toToken}/USD`);

      if (!fromAssetId || !toAssetId) {
        return null;
      }

      const { price: fromPrice } = await this.getLatestPrice(fromAssetId);
      const { price: toPrice } = await this.getLatestPrice(toAssetId);

      // Calculate the exchange rate (fromToken to toToken)
      if (toPrice === 0) return null;
      return fromPrice / toPrice;
    } catch (error) {
      console.error(
        `Error calculating price for ${fromToken}/${toToken}:`,
        error,
      );
      return null;
    }
  }
}

export default ApiService.getInstance();
