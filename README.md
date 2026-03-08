# CHANDRAMART NSE Live Data Server
**Owner:** Debasis Chandra  
**Brand:** CHANDRAMART

## Deploy on Railway (Free)
1. Push this folder to GitHub
2. Go to railway.app → New Project → Deploy from GitHub
3. Select this repo → Deploy
4. Get your free URL like: https://chandramart-server.up.railway.app

## API Endpoints
- GET `/` — Health check
- GET `/stock?sym=RELIANCE` — Single stock price
- GET `/stocks?syms=RELIANCE,TCS,ICICIBANK` — Multiple stocks
- GET `/indices` — NIFTY 50, BANK NIFTY, SENSEX
- GET `/market-status` — Is market open?
- GET `/movers` — Top gainers & losers
