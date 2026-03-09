import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { TradingChart } from './components/TradingChart';
import { TradePanel } from './components/TradePanel';
import { Auth } from './components/Auth';
import { History, TrendingUp, LogOut, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from './lib/utils';

interface User {
  id: number;
  username: string;
  balance: number;
}

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}

interface Trade {
  id: number;
  lotSize: number;
  direction: 'buy' | 'sell';
  entryPrice: number;
  closePrice?: number;
  startTime: number;
  closeTime?: number;
  status: 'open' | 'closed';
  pnl: number;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [socket, setSocket] = useState<Socket | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPrice, setCurrentPrice] = useState(0);

  const fetchInitialData = useCallback(async (authToken: string) => {
    try {
      console.log('Fetching initial data...');
      const [userRes, tradesRes, candlesRes] = await Promise.all([
        fetch('/api/me', { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch('/api/trades', { headers: { Authorization: `Bearer ${authToken}` } }),
        fetch('/api/candles')
      ]);

      if (userRes.ok && tradesRes.ok && candlesRes.ok) {
        const userData = await userRes.json();
        const tradesData = await tradesRes.json();
        const candlesData = await candlesRes.json();
        console.log('Data fetched successfully');
        setUser(userData);
        setTrades(tradesData);
        setCandles(candlesData);
        if (candlesData.length > 0) setCurrentPrice(candlesData[candlesData.length - 1].close);
      } else {
        console.error('Failed to fetch initial data', userRes.status, tradesRes.status, candlesRes.status);
        handleLogout();
      }
    } catch (err) {
      console.error('Failed to fetch data', err);
      // If it's a connection error, we might want to retry or show an error state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchInitialData(token);
      const newSocket = io();
      setSocket(newSocket);

      newSocket.emit('authenticate', token);

      newSocket.on('price_update', (data: { price: number; candle: Candle }) => {
        setCurrentPrice(data.price);
        setCandles(prev => {
          const last = prev[prev.length - 1];
          if (last && last.timestamp === data.candle.timestamp) {
            return [...prev.slice(0, -1), data.candle];
          }
          return [...prev, data.candle].slice(-100);
        });
      });

      newSocket.on('balance_update', ({ balance }) => {
        setUser(prev => prev ? { ...prev, balance } : null);
      });

      return () => {
        newSocket.close();
      };
    } else {
      setLoading(false);
    }
  }, [token, fetchInitialData]);

  const handleAuth = (newToken: string, userData: User) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    if (socket) socket.close();
  };

  const handleTrade = async (lotSize: number, direction: 'buy' | 'sell') => {
    if (!token) return;
    try {
      const res = await fetch('/api/trade', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ lotSize, direction })
      });
      const data = await res.json();
      if (res.ok) {
        setTrades(prev => [{
          id: data.id,
          lotSize,
          direction,
          entryPrice: data.entryPrice,
          startTime: data.startTime,
          status: 'open',
          pnl: 0
        }, ...prev]);
      }
    } catch (err) {
      console.error('Trade failed', err);
    }
  };

  const handleCloseTrade = async (tradeId: number) => {
    if (!token) return;
    try {
      const res = await fetch('/api/trade/close', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ tradeId })
      });
      const data = await res.json();
      if (res.ok) {
        setTrades(prev => prev.map(t => 
          t.id === tradeId 
            ? { ...t, status: 'closed', closePrice: data.closePrice, pnl: data.pnl } 
            : t
        ));
      }
    } catch (err) {
      console.error('Close trade failed', err);
    }
  };

  const calculateLivePnL = (trade: Trade) => {
    if (trade.status === 'closed') return trade.pnl;
    return trade.direction === 'buy' 
      ? (currentPrice - trade.entryPrice) * trade.lotSize * 100 
      : (trade.entryPrice - currentPrice) * trade.lotSize * 100;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth onAuth={handleAuth} />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <header className="h-16 border-b border-white/5 bg-[#111827]/50 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
            <TrendingUp size={24} />
          </div>
          <span className="text-xl font-black tracking-tighter uppercase">GoldX Forex</span>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Market Price</span>
            <span className={cn(
              "font-mono font-bold",
              candles.length > 1 && candles[candles.length-1].close >= candles[candles.length-1].open ? "text-emerald-400" : "text-rose-400"
            )}>${currentPrice.toFixed(2)}</span>
          </div>
          <div className="h-8 w-px bg-white/10" />
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{user.username}</p>
              <p className="text-sm font-black text-white">${user.balance.toFixed(2)}</p>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:flex-row p-6 gap-6 overflow-hidden">
        {/* Left: Chart & History */}
        <div className="flex-1 flex flex-col gap-6 overflow-hidden">
          <div className="flex-1 min-h-[400px]">
            <TradingChart candles={candles} />
          </div>
          
          <div className="h-64 bg-[#111827] rounded-2xl border border-white/5 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center gap-2 text-gray-400">
              <History size={18} />
              <span className="text-xs font-bold uppercase tracking-widest">Active & Past Trades</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#111827] text-gray-500 uppercase text-[10px] font-bold tracking-widest">
                  <tr>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Lots</th>
                    <th className="px-4 py-3">Entry</th>
                    <th className="px-4 py-3">PnL</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {trades.map(trade => {
                    const livePnL = calculateLivePnL(trade);
                    return (
                      <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-black uppercase",
                            trade.direction === 'buy' ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
                          )}>
                            {trade.direction}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold">{trade.lotSize}</td>
                        <td className="px-4 py-3 font-mono">${trade.entryPrice.toFixed(2)}</td>
                        <td className={cn(
                          "px-4 py-3 font-mono font-bold",
                          livePnL >= 0 ? "text-emerald-500" : "text-rose-500"
                        )}>
                          {livePnL >= 0 ? '+' : ''}{livePnL.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {trade.status === 'open' ? (
                            <button
                              onClick={() => handleCloseTrade(trade.id)}
                              className="bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold uppercase px-3 py-1.5 rounded-lg transition-all"
                            >
                              Close
                            </button>
                          ) : (
                            <span className="text-[10px] font-bold uppercase text-gray-500">Closed</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right: Trade Panel */}
        <div className="w-full lg:w-96 shrink-0">
          <TradePanel 
            balance={user.balance} 
            currentPrice={currentPrice}
            onTrade={handleTrade}
            isTrading={false}
          />
        </div>
      </main>
    </div>
  );
}
