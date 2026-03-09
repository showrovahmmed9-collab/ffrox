import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  timestamp: number;
}

interface TradingChartProps {
  candles: Candle[];
}

export const TradingChart: React.FC<TradingChartProps> = ({ candles }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || candles.length < 2) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 20, right: 60, bottom: 30, left: 20 };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const x = d3.scaleTime()
      .domain(d3.extent(candles, (d: Candle) => new Date(d.timestamp)) as [Date, Date])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([
        (d3.min(candles, (d: Candle) => d.low) || 0) * 0.9999,
        (d3.max(candles, (d: Candle) => d.high) || 0) * 1.0001
      ])
      .range([height - margin.bottom, margin.top]);

    // Grid lines
    svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickSize(-height + margin.top + margin.bottom).tickFormat(() => ""))
      .attr("stroke-opacity", 0.05);

    svg.append("g")
      .attr("class", "grid")
      .attr("transform", `translate(${width - margin.right},0)`)
      .call(d3.axisRight(y).ticks(5).tickSize(-width + margin.left + margin.right).tickFormat(() => ""))
      .attr("stroke-opacity", 0.05);

    // Candlesticks
    const candleWidth = (width - margin.left - margin.right) / candles.length * 0.8;

    const candleGroup = svg.append("g");

    candles.forEach(d => {
      const isUp = d.close >= d.open;
      const color = isUp ? "#10b981" : "#f43f5e";

      // Wick
      candleGroup.append("line")
        .attr("x1", x(new Date(d.timestamp)))
        .attr("x2", x(new Date(d.timestamp)))
        .attr("y1", y(d.high))
        .attr("y2", y(d.low))
        .attr("stroke", color)
        .attr("stroke-width", 1);

      // Body
      candleGroup.append("rect")
        .attr("x", x(new Date(d.timestamp)) - candleWidth / 2)
        .attr("y", y(Math.max(d.open, d.close)))
        .attr("width", candleWidth)
        .attr("height", Math.max(1, Math.abs(y(d.open) - y(d.close))))
        .attr("fill", color);
    });

    // Axes
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat("%H:%M:%S") as any))
      .style("color", "#6b7280");

    svg.append("g")
      .attr("transform", `translate(${width - margin.right},0)`)
      .call(d3.axisRight(y).ticks(5))
      .style("color", "#6b7280");

    // Current Price Line
    const lastCandle = candles[candles.length - 1];
    svg.append("line")
      .attr("x1", margin.left)
      .attr("x2", width - margin.right)
      .attr("y1", y(lastCandle.close))
      .attr("y2", y(lastCandle.close))
      .attr("stroke", lastCandle.close >= lastCandle.open ? "#10b981" : "#f43f5e")
      .attr("stroke-dasharray", "4,4")
      .attr("stroke-opacity", 0.8);

    // Price label on axis
    const labelGroup = svg.append("g")
      .attr("transform", `translate(${width - margin.right}, ${y(lastCandle.close)})`);

    labelGroup.append("rect")
      .attr("x", 0)
      .attr("y", -10)
      .attr("width", 60)
      .attr("height", 20)
      .attr("fill", lastCandle.close >= lastCandle.open ? "#10b981" : "#f43f5e");

    labelGroup.append("text")
      .attr("x", 5)
      .attr("y", 4)
      .attr("fill", "white")
      .attr("font-size", "10px")
      .attr("font-weight", "bold")
      .text(lastCandle.close.toFixed(2));

  }, [candles]);

  return (
    <div ref={containerRef} className="w-full h-full bg-[#0a0a0a] rounded-xl overflow-hidden border border-white/5">
      <svg ref={svgRef} className="w-full h-full" />
    </div>
  );
};
