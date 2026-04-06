import { Router } from "express";

const router = Router();

router.get("/:symbol", (req, res) => {
  const symbol = req.params["symbol"]?.toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: "symbol is required" });
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${symbol} — Zone Chart</title>
  <script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0d1117; color: #e6edf3; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #header { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid #21262d; }
    #header h1 { font-size: 18px; font-weight: 600; }
    #price-badge { font-size: 22px; font-weight: 700; color: #58a6ff; }
    #status { font-size: 12px; color: #8b949e; margin-left: auto; }
    #chart { width: 100%; height: calc(100vh - 56px); }
  </style>
</head>
<body>
  <div id="header">
    <h1>${symbol}</h1>
    <span id="price-badge">—</span>
    <span id="status">Connecting…</span>
  </div>
  <div id="chart"></div>

  <script>
    const SYMBOL = "${symbol}";
    const TOKEN = new URLSearchParams(window.location.search).get("token") || "";
    const BASE = window.location.origin + "/api";
    const WS_BASE = window.location.origin.replace(/^https/, "wss").replace(/^http/, "ws");

    const chart = echarts.init(document.getElementById("chart"), "dark");
    const candles = [];
    const supplyOverlays = [];
    const demandOverlays = [];
    const zoneMap = new Map();

    function renderChart() {
      chart.setOption({
        backgroundColor: "#0d1117",
        tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
        xAxis: { type: "category", data: candles.map(c => new Date(c[0]).toLocaleString()), scale: true, boundaryGap: false, splitLine: { show: false } },
        yAxis: { scale: true, splitArea: { show: true, areaStyle: { color: ["rgba(255,255,255,0.01)", "transparent"] } } },
        series: [
          {
            name: SYMBOL,
            type: "candlestick",
            data: candles.map(c => [c[1], c[4], c[3], c[2]]),
            itemStyle: { color: "#3fb950", color0: "#f85149", borderColor: "#3fb950", borderColor0: "#f85149" },
          },
          ...supplyOverlays,
          ...demandOverlays,
        ],
        grid: { left: "3%", right: "3%", bottom: "3%", containLabel: true },
      }, true);
    }

    function buildZoneOverlay(zone, isSupply) {
      return {
        name: (isSupply ? "Supply" : "Demand") + " " + zone.id,
        type: "line",
        markArea: {
          silent: true,
          data: [[
            { yAxis: zone.distal, itemStyle: { color: isSupply ? "rgba(248,81,73,0.15)" : "rgba(63,185,80,0.15)", borderColor: isSupply ? "#f85149" : "#3fb950", borderWidth: 1 } },
            { yAxis: zone.proximal },
          ]],
        },
        data: [],
      };
    }

    async function loadInitialData() {
      const headers = TOKEN ? { Authorization: "Bearer " + TOKEN } : {};
      try {
        const [zonesRes, scanRes] = await Promise.all([
          fetch(BASE + "/zones/" + SYMBOL + "/confluent", { headers }),
          fetch(BASE + "/scan/" + SYMBOL, { headers }).catch(() => null),
        ]);
        const zones = await zonesRes.json();
        for (const zone of zones) {
          zoneMap.set(zone.id, zone);
          const ol = buildZoneOverlay(zone, zone.direction === 0);
          if (zone.direction === 0) supplyOverlays.push(ol);
          else demandOverlays.push(ol);
        }
        if (scanRes?.ok) {
          const scan = await scanRes.json();
          if (scan.ivRank != null) document.getElementById("status").textContent = "IV Rank: " + scan.ivRank.toFixed(1);
        }
        renderChart();
      } catch (e) {
        console.error("loadInitialData error", e);
      }
    }

    function connectWs() {
      const wsUrl = WS_BASE + "/stream/" + SYMBOL + (TOKEN ? "?token=" + TOKEN : "");
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => { document.getElementById("status").textContent = "Live"; };
      ws.onclose = () => {
        document.getElementById("status").textContent = "Reconnecting…";
        setTimeout(connectWs, 3000);
      };

      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);

        if (msg.type === "price") {
          document.getElementById("price-badge").textContent = "$" + msg.price.toFixed(2);
        } else if (msg.type === "candle") {
          const c = msg.candle;
          candles.push([c.timestamp, c.open, c.high, c.low, c.close]);
          if (candles.length > 500) candles.shift();
          renderChart();
        } else if (msg.type === "zone_created" || msg.type === "zone_updated") {
          zoneMap.set(msg.zone.id, msg.zone);
          supplyOverlays.length = 0;
          demandOverlays.length = 0;
          for (const [, zone] of zoneMap) {
            const ol = buildZoneOverlay(zone, zone.direction === 0);
            if (zone.direction === 0) supplyOverlays.push(ol);
            else demandOverlays.push(ol);
          }
          renderChart();
        } else if (msg.type === "zone_expired" || msg.type === "zone_breached") {
          zoneMap.delete(msg.zoneId ?? msg.zone?.id);
          supplyOverlays.length = 0;
          demandOverlays.length = 0;
          for (const [, zone] of zoneMap) {
            const ol = buildZoneOverlay(zone, zone.direction === 0);
            if (zone.direction === 0) supplyOverlays.push(ol);
            else demandOverlays.push(ol);
          }
          renderChart();
        } else if (msg.type === "zone_entered") {
          const existing = zoneMap.get(msg.zone.id);
          if (existing) existing.priceInside = true;
        }
      };
    }

    loadInitialData();
    connectWs();
    window.addEventListener("resize", () => chart.resize());
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html");
  res.send(html);
});

export default router;
