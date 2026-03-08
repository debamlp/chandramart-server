const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*', methods: ['GET','POST','OPTIONS'], allowedHeaders: ['Content-Type'] }));
app.options('*', cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/market-data/live-equity-market',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
  'X-Requested-With': 'XMLHttpRequest',
};

let nseCookies = '';
let cookieTime = 0;

async function refreshNSECookies() {
  try {
    const res = await axios.get('https://www.nseindia.com/market-data/live-equity-market', {
      headers: { 'User-Agent': NSE_HEADERS['User-Agent'], 'Accept': 'text/html,*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      timeout: 12000,
    });
    const setCookie = res.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
      nseCookies = setCookie.map(c => c.split(';')[0]).join('; ');
      cookieTime = Date.now();
      console.log('Cookies refreshed at', new Date().toISOString());
      return true;
    }
  } catch (e) { console.error('Cookie refresh failed:', e.message); }
  return false;
}

async function getNSEData(url) {
  if (!nseCookies || Date.now() - cookieTime > 20 * 60 * 1000) await refreshNSECookies();
  try {
    const res = await axios.get(url, { headers: { ...NSE_HEADERS, 'Cookie': nseCookies }, timeout: 12000 });
    return res.data;
  } catch (e) {
    if (e.response && (e.response.status === 401 || e.response.status === 403)) {
      await refreshNSECookies();
      const retry = await axios.get(url, { headers: { ...NSE_HEADERS, 'Cookie': nseCookies }, timeout: 12000 });
      return retry.data;
    }
    throw e;
  }
}

app.get('/', (req, res) => {
  res.json({ status: 'CHANDRAMART Server Running', owner: 'Debasis Chandra', brand: 'CHANDRAMART', cookiesActive: !!nseCookies, time: new Date().toISOString() });
});

app.get('/test', (req, res) => {
  res.json({ ok: true, message: 'CHANDRAMART server is reachable!', time: new Date().toISOString() });
});

app.get('/stock', async (req, res) => {
  const sym = (req.query.sym || '').toUpperCase().trim();
  if (!sym) return res.status(400).json({ error: 'sym required' });
  try {
    const data = await getNSEData(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(sym)}`);
    const pd = data.priceInfo || {};
    res.json({ symbol: sym, name: (data.metadata||{}).companyName||sym, price: pd.lastPrice, open: pd.open, high: pd.intraDayHighLow?.max, low: pd.intraDayHighLow?.min, prevClose: pd.previousClose, chgPct: pd.pChange, chgAmt: pd.change, vwap: pd.vwap, week52High: pd.weekHighLow?.max, week52Low: pd.weekHighLow?.min, source: 'NSE India', time: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message, sym }); }
});

app.get('/stocks', async (req, res) => {
  const syms = (req.query.syms || '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean);
  if (!syms.length) return res.status(400).json({ error: 'syms required' });
  const results = await Promise.allSettled(
    syms.map(sym => getNSEData(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(sym)}`).then(data => {
      const pd = data.priceInfo || {};
      return { sym, price: pd.lastPrice, open: pd.open, high: pd.intraDayHighLow?.max, low: pd.intraDayHighLow?.min, prevClose: pd.previousClose, chgPct: pd.pChange, chgAmt: pd.change, vwap: pd.vwap };
    }))
  );
  const prices = {};
  results.forEach((r, i) => { prices[syms[i]] = r.status === 'fulfilled' ? r.value : { error: 'failed' }; });
  res.json({ prices, time: new Date().toISOString(), source: 'NSE India' });
});

app.get('/indices', async (req, res) => {
  try {
    const data = await getNSEData('https://www.nseindia.com/api/allIndices');
    const want = ['NIFTY 50', 'NIFTY BANK', 'NIFTY IT', 'INDIA VIX'];
    const result = {};
    (data.data || []).forEach(idx => {
      const key = idx.indexSymbol || idx.index;
      if (want.includes(key)) result[key] = { price: idx.last, chgPct: idx.percentChange, chgAmt: idx.change, high: idx.high, low: idx.low };
    });
    res.json({ indices: result, time: new Date().toISOString() });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/movers', async (req, res) => {
  try {
    const data = await getNSEData('https://www.nseindia.com/api/live-analysis-variations?index=gainers');
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, async () => {
  console.log('CHANDRAMART Server on port', PORT);
  await refreshNSECookies();
});

setInterval(refreshNSECookies, 20 * 60 * 1000);    
