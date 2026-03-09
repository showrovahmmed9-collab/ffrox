import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Wallet, TrendingUp } from 'lucide-react';
import { cn } from '../lib/utils';

interface TradePanelProps {
  balance: number;
  currentPrice: number;
  onTrade: (lotSize: number, direction: 'buy' | 'sell') => void;
  isTrading: boolean;
}

export const TradePanel: React.FC<TradePanelProps> = ({ balance, currentPrice, onTrade, isTrading }) => {
  const [lotSize, setLotSize] = useState(0.01);

  return (
    <div className="flex flex-col gap-6 p-6 bg-[#111827] rounded-2xl border border-white/5 shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-400">
          <Wallet size={18} />
          <span className="text-sm font-medium uppercase tracking-wider">Balance</span>
        </div>
        <span className="text-2xl font-bold text-white">${balance.toFixed(2)}</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Lot Size (Volume)</label>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[0.01, 0.05, 0.1, 0.5].map(val => (
              <button
                key={val}
                onClick={() => setLotSize(val)}
                className={cn(
                  "py-2 text-xs font-bold rounded-lg border transition-all",
                  lotSize === val 
                    ? "bg-emerald-500 border-emerald-500 text-black" 
                    : "bg-white/5 border-white/10 text-gray-400 hover:border-white/20"
                )}
              >
                {val}
              </button>
            ))}
          </div>
          <input
            type="number"
            step="0.01"
            value={lotSize}
            onChange={(e) => setLotSize(Number(e.target.value))}
            className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl py-3 px-4 text-white font-medium focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onTrade(lotSize, 'buy')}
          disabled={isTrading || balance < 10}
          className={cn(
            "flex flex-col items-center justify-center gap-2 py-6 rounded-2xl transition-all active:scale-95",
            "bg-emerald-500 text-black hover:bg-emerald-600",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <ArrowUp size={32} />
          <span className="font-black uppercase tracking-widest">Buy</span>
        </button>

        <button
          onClick={() => onTrade(lotSize, 'sell')}
          disabled={isTrading || balance < 10}
          className={cn(
            "flex flex-col items-center justify-center gap-2 py-6 rounded-2xl transition-all active:scale-95",
            "bg-rose-500 text-white hover:bg-rose-600",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <ArrowDown size={32} />
          <span className="font-black uppercase tracking-widest">Sell</span>
        </button>
      </div>

      <div className="pt-4 border-t border-white/5">
        <div className="flex items-center justify-between text-gray-500">
          <span className="text-xs font-medium uppercase">Market Price</span>
          <span className="font-mono text-emerald-400 font-bold">${currentPrice.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};
