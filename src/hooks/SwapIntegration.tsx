'use client';

import { parseUnits } from 'viem';
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { useState, useEffect } from 'react';
import { IfaSwapRouterABI } from '@/lib/abis/swap-router-abi';
import { ERC20ABI } from '@/lib/abis/erc20-abi';

// Contract addresses
const ROUTER_ADDRESS = '0xcd6ceef9081622e5d59c54b7569e0979494dc207';

export interface SwapExecutionProps {
  fromToken: {
    address: string;
    symbol: string;
    decimals: number;
  };
  toToken: {
    address: string;
    symbol: string;
    decimals: number;
  };
  fromAmount: string;
  slippageTolerance: number; // e.g., 0.5 for 0.5%
  deadline: number; // Unix timestamp
  recipient: `0x${string}`;
}

interface ApprovalResult {
  isApproved: boolean;
  isApproving: boolean;
  error: Error | null;
  approve: () => void;
}

interface SwapResult {
  isLoading: boolean;
  isPending: boolean;
  isSuccess: boolean;
  error: Error | null;
  data: any;
  expectedOutput: bigint;
  minAmountOut: bigint;
  execute: () => void;
}

/**
 * Hook to check and execute ERC20 token approval
 */
export function useTokenApproval(
  tokenAddress: string | undefined,
  spenderAddress: string | undefined,
  amount: string,
  decimals: number,
): ApprovalResult {
  const { address: userAddress } = useAccount();

  const enabled =
    !!tokenAddress &&
    !!spenderAddress &&
    !!userAddress &&
    amount !== '' &&
    parseFloat(amount) > 0;

  const amountInWei = enabled ? parseUnits(amount, decimals) : BigInt(0);

  const { data: allowance } = useReadContract({
    address: tokenAddress as `0x${string}`,
    abi: ERC20ABI,
    functionName: 'allowance',
    args: [userAddress as `0x${string}`, spenderAddress as `0x${string}`],
    query: {
      enabled,
      refetchInterval: 10000,
    },
  });

  const {
    data: approveResult,
    writeContract,
    isPending: isApproving,
    error: writeError,
  } = useWriteContract();

  const { isSuccess: isApprovalSuccess } = useWaitForTransactionReceipt({
    hash: approveResult,
  });

  const approve = () => {
    if (!tokenAddress || !spenderAddress || !enabled) return;
    writeContract({
      address: tokenAddress as `0x${string}`,
      abi: ERC20ABI,
      functionName: 'approve',
      args: [spenderAddress as `0x${string}`, amountInWei],
    });
  };

  const isApproved =
    enabled &&
    !!allowance &&
    (amountInWei <= (allowance as bigint) || isApprovalSuccess);

  return {
    isApproved,
    isApproving,
    error: writeError,
    approve,
  };
}

/**
 * Hook to execute a token swap
 */
export function useSwapExecution({
  fromToken,
  toToken,
  fromAmount,
  slippageTolerance,
  deadline,
  recipient,
}: SwapExecutionProps): SwapResult {
  const [expectedOutput, setExpectedOutput] = useState<bigint>(BigInt(0));
  const [minAmountOut, setMinAmountOut] = useState<bigint>(BigInt(0));
  const [isReady, setIsReady] = useState(false);

  const enabled =
    !!fromToken?.address &&
    !!toToken?.address &&
    fromAmount !== '' &&
    parseFloat(fromAmount) > 0;

  const amountInWei = enabled
    ? parseUnits(fromAmount, fromToken.decimals)
    : BigInt(0);

  const path = [
    fromToken.address as `0x${string}`,
    toToken.address as `0x${string}`,
  ];

  const { data: amountsOut, isSuccess: isAmountsOutSuccess } = useReadContract({
    address: ROUTER_ADDRESS as `0x${string}`,
    abi: IfaSwapRouterABI,
    functionName: 'getAmountsOut',
    args: [amountInWei, path],
    query: {
      enabled,
      refetchInterval: 10000,
    },
  });

  useEffect(() => {
    if (
      isAmountsOutSuccess &&
      amountsOut &&
      Array.isArray(amountsOut) &&
      amountsOut.length > 1
    ) {
      const outputAmount = amountsOut[1] as bigint;
      setExpectedOutput(outputAmount);

      const slippageBasisPoints = Math.floor(slippageTolerance * 100); // 0.5% => 50
      const minOutput =
        (outputAmount * BigInt(10000 - slippageBasisPoints)) / BigInt(10000);
      setMinAmountOut(minOutput);
      setIsReady(true);
    } else {
      setIsReady(false);
    }
  }, [amountsOut, isAmountsOutSuccess, slippageTolerance]);

  const {
    data: swapResult,
    writeContract,
    isPending,
    error: swapError,
  } = useWriteContract();

  const { isSuccess } = useWaitForTransactionReceipt({
    hash: swapResult,
  });

  const execute = () => {
    if (!isReady || !enabled) return;
    writeContract({
      address: ROUTER_ADDRESS as `0x${string}`,
      abi: IfaSwapRouterABI,
      functionName: 'swapExactTokensForTokens',
      args: [amountInWei, minAmountOut, path, recipient, BigInt(deadline)],
    });
  };

  return {
    isLoading: isPending,
    isPending,
    isSuccess,
    error: swapError,
    data: swapResult,
    expectedOutput,
    minAmountOut,
    execute,
  };
}

export function getDeadlineTimestamp(minutes: number): number {
  return Math.floor(Date.now() / 1000) + minutes * 60;
}
