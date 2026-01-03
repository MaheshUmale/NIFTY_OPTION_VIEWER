# NSE Option Chain Analyzer

A web-based tool to analyze NSE Option Chain data in real-time. It replaces traditional desktop-based Tkinter apps with a modern React UI, offering interactive charts, PCR analysis, Max Pain calculation, and historical data backfilling.

## Features

- **Real-time Dashboard**: View Spot Price, PCR (Put-Call Ratio), Max Pain, and Support/Resistance levels.
- **Interactive Charts**: Visual representation of Open Interest (OI) distribution.
- **Backfill Capability**: Fetch historical intraday snapshots (15-min intervals) to analyze trends.
- **Local Persistence**: Data is saved to your browser's LocalStorage for history tracking.
- **JSON Export**: Download analyzed data in JSON format for use in other applications.
- **CLI Downloader**: A Node.js script to download option chain data directly from the terminal without opening the browser.

## Prerequisites

- **Node.js**: Required to run the proxy server and development server.

## Installation

1.  **Download/Clone the repository** to your local machine.
2.  **Install dependencies**:
    ```bash
    npm install
    ```

## Running the Application

You need to run two separate processes: the Backend Proxy (for API data) and the Frontend UI.

### 1. Start the Proxy Service
This service bypasses CORS restrictions and fetches data from the source.
**Note:** Runs on Port 5001 to avoid conflicts with macOS AirPlay (port 5000).
```bash
node service.js
```
*Keep this terminal open.*

### 2. Start the Frontend UI
In a new terminal window, run:
```bash
npm run dev
```
Open the local URL shown (e.g., `http://localhost:5173`) in your browser.

## CLI Data Downloader

If you want to download Option Chain data as a JSON file without using the Web UI:

```bash
node service.js --symbol=NIFTY
```

## How to Use

1.  **Select Index**: Choose NIFTY, BANKNIFTY, or FINNIFTY from the dropdown.
2.  **Refresh**: Fetches the latest live data.
3.  **Backfill**: 
    - Ensure `node service.js` is running.
    - Click "Backfill" to fetch intraday snapshots.
4.  **Charts**: Visualize the Call vs. Put Open Interest.
5.  **Export API**: Click to download the current state as a JSON file.

## Troubleshooting

- **"Connection Failed / Proxy Error"**: Ensure `node service.js` is running on port 5001.
- **"Failed to fetch"**: Check your terminal for errors. If port 5001 is also blocked, edit `service.js` to change the PORT.

## Disclaimer

This tool is for educational purposes only. Data is fetched from third-party sources (Trendlyne) and may be delayed or inaccurate. Do not use for financial trading decisions.