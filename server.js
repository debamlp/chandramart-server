const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors()); // Allow requests from your app
app.use(express.json());

const PORT = process.env.PORT || 3000;

// NSE Headers — mimics real browser
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.nseindia.com/',
  'Origin': 'https://www.nseindia.com',
  'Connection': 'keep-alive',
};

// Store NSE cookies (refreshed every 30 min)
let nseCookies = '';
let cookieTime = 0;

async function refreshNSECookies() {
  try {
    const res = await axios.get('https://www.nseindia.com', {
      headers: NSE_HEADERS,
      timeout: 10000,
    });
    const setCookie = res.headers['set-cookie'];
    if (setCookie) {
      nseCookies = setCookie.map(c => c.split(';')[0]).join('; ');
      cookieTime = Date.now();
      console.log('✅ NSE cookies refreshed');
    }
  } catch (e) {
    console.error('❌ Cookie refresh failed:', e.message);
  }
}

async function getNSEData(url) {
  // Refresh cookies if older than 25 minutes
  if (!nseCookies || Date.now() - cookieTime > 25 * 60 * 1000) {
    await refreshNSECookies();
  }
  const res = await axios.get(url, {
    headers: { ...NSE_HEADERS, 'Cookie': nseCookies },
    timeout: 10000,
  });
  return res.data;
}

// ── ROUTE: Single Stock Price ──
// GET /stock?sym=RELIANCE
app.get('/stock', async (req, res) => {
  const sym = (req.query.sym || '').toUpperCase().trim();
  if (!sym) return res.status(400).json({ error: 'sym required' });
  try {
    const data = await getNSEData(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(sym)}`);
    const pd = data.priceInfo;
    const md = data.metadata;
    res.json({
      symbol:    sym,
      name:      md?.companyName || sym,
      price:     pd?.lastPrice,
      open:      pd?.open,
      high:      pd?.intraDayHighLow?.max,
      low:       pd?.intraDayHighLow?.min,
      prevClose: pd?.previousClose,
      chgPct:    pd?.pChange,
      chgAmt:    pd?.change,
      volume:    data?.marketDeptOrderBook?.tradeInfo?.totalTradedVolume,
      vwap:      pd?.vwap,
      week52High: pd?.weekHighLow?.max,
      week52Low:  pd?.weekHighLow?.min,
      source:    'NSE India',
      time:      new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ROUTE: Multiple Stocks at once ──
// GET /stocks?syms=RELIANCE,TCS,ICICIBANK
app.get('/stocks', async (req, res) => {
  const syms = (req.query.syms || '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!syms.length) return res.status(400).json({ error: 'syms required' });
  try {
    const results = await Promise.allSettled(
      syms.map(sym =>
        getNSEData(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(sym)}`)
          .then(data => {
            const pd = data.priceInfo;
            return {
              symbol:    sym,
              price:     pd?.lastPrice,
              open:      pd?.open,
              high:      pd?.intraDayHighLow?.max,
              low:       pd?.intraDayHighLow?.min,
              prevClose: pd?.previousClose,
              chgPct:    pd?.pChange,
              chgAmt:    pd?.change,
              vwap:      pd?.vwap,
            };
          })
      )
    );
    const prices = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') prices[syms[i]] = r.value;
      else prices[syms[i]] = { error: 'fetch failed' };
    });
    res.json({ prices, time: new Date().toISOString(), source: 'NSE India' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ROUTE: All Indices (NIFTY, SENSEX, BANKNIFTY) ──
// GET /indices
app.get('/indices', async (req, res) => {
  try {
    const data = await getNSEData('https://www.nseindia.com/api/allIndices');
    const want = ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'NIFTY MIDCAP 100', 'INDIA VIX'];
    const result = {};
    data.data?.forEach(idx => {
      if (want.includes(idx.indexSymbol) || want.includes(idx.index)) {
        const key = idx.indexSymbol || idx.index;
        result[key] = {
          price:  idx.last,
          chgPct: idx.percentChange,
          chgAmt: idx.change,
          high:   idx.high,
          low:    idx.low,
          open:   idx.open,
          prev:   idx.previousClose,
        };
      }
    });
    res.json({ indices: result, time: new Date().toISOString(), source: 'NSE India' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ROUTE: Market Status ──
// GET /market-status
app.get('/market-status', async (req, res) => {
  try {
    const data = await getNSEData('https://www.nseindia.com/api/marketStatus');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── ROUTE: Top Gainers & Losers ──
// GET /movers
app.get('/movers', async (req, res) => {
  try {
    const data = await getNSEData('https://www.nseindia.com/api/live-analysis-variations?index=gainers');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Health Check ──
app.get('/', (req, res) => {
  res.json({
    status: 'CHANDRAMART NSE Server Running ✅',
    owner: 'Debasis Chandra',
    brand: 'CHANDRAMART',
    endpoints: ['/stock?sym=RELIANCE', '/stocks?syms=RELIANCE,TCS', '/indices', '/market-status', '/movers'],
    time: new Date().toISOString(),
  });
});

// Start server + warm up cookies immediately
app.listen(PORT, async () => {
  console.log(`🚀 CHANDRAMART Server running on port ${PORT}`);
  await refreshNSECookies();
});

// Refresh cookies every 25 minutes automatically
setInterval(refreshNSECookies, 25 * 60 * 1000);
