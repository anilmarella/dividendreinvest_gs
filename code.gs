/**
 * Fetches historical data table HTML from Yahoo Finance for a given ticker and date range.
 * @param {string} ticker - Stock symbol (e.g., 'AAPL')
 * @param {string} startDateStr - Start date in string format (YYYY-MM-DD)
 * @param {string} [filter='div'] - Data filter type ('div' for dividends, 'price' for prices)
 * @returns {string|Array} HTML table string or error message array
 */
function getHistoryTableHTML(ticker, startDateStr, filter = 'div') {
  // Base URL construction
  const baseUrl = `https://finance.yahoo.com/quote/${ticker}/history`;
  const startDate = new Date(startDateStr);
  let endDate = new Date();
  const params = {};

  // Special handling for price filter - look at single trading day
  if (filter === 'price') {
    endDate = new Date(startDateStr);
    endDate.setDate(endDate.getDate() + 1);
  }

  // Convert dates to UNIX timestamps for URL parameters
  params.period1 = Math.floor(startDate.getTime() / 1000);
  params.period2 = Math.floor(endDate.getTime() / 1000);
  params.filter = filter;

  // Construct query string from parameters
  const queryString = Object.keys(params)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
  const url = `${baseUrl}?${queryString}`;

  // Fetch data from Yahoo Finance
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });

  // Handle HTTP errors
  if (response.getResponseCode() !== 200) {
    return [['Error', 'Failed to fetch data. Please check the ticker symbol or the website.']];
  }

  // Extract table HTML using regex (note: fragile to page structure changes)
  const html = response.getContentText();
  const historicalDataRegex = /<table[^>]*>.*?<\/table>/s;
  const tableMatch = html.match(historicalDataRegex);

  return tableMatch?.[0] || [['Error', 'Unable to locate historical data table.']];
}
  
/**
 * Retrieves dividend and corresponding price data for a given ticker and start date.
 * @param {string} ticker - Stock symbol
 * @param {string} startDateStr - Start date in string format (YYYY-MM-DD)
 * @returns {Object} Dividend price data organized by date
 */
function getDividendPriceData(ticker, startDateStr) {
  // Get dividend history table HTML
  const divTableHTML = getHistoryTableHTML(ticker, startDateStr, 'div');
  
  // Regex patterns for parsing HTML tables
  const rowRegex = /<tr class="yf-1jecxey">.*?<\/tr>/g;
  const cellRegex = /<td[^>]*>(.*?)<\/td>/g;
  const spanRegex = /<span[^>]*>(.*?)<\/span>/;

  // Parse dividend data from table
  const divRows = divTableHTML.match(rowRegex) || [];
  const dividendData = {};
  
  for (const row of divRows) {
    const cells = [...row.matchAll(cellRegex)];
    if (cells.length >= 2) {
      const date = new Date(cells[0][1].trim()).toISOString().split('T')[0];
      const dividendMatch = cells[1][1].match(spanRegex);
      dividendData[date] = dividendMatch?.[1]?.trim() || null;
    }
  }

  // Retrieve corresponding price data for each dividend date
  const divPriceData = {};
  for (const dateKey in dividendData) {
    const priceTableHTML = getHistoryTableHTML(ticker, dateKey, 'price');
    const priceRows = priceTableHTML.match(rowRegex) || [];
    
    for (const row of priceRows) {
      const cells = [...row.matchAll(cellRegex)];
      if (cells.length >= 5) {
        divPriceData[dateKey] = {
          dividend: dividendData[dateKey],
          price: cells[4][1].trim() // Contains closing price
        };
      }
    }
  }

  return divPriceData;
}
  
/**
 * Calculates adjusted share quantity after reinvesting dividends.
 * @param {Array} rangeObject - Input array containing [ticker, date, quantity]
 * @returns {number} Adjusted share quantity
 */
function getAdjustedQuantities(rangeObject) {
  const [ticker, date, quantity] = rangeObject[0];
  let newQuantity = quantity;
  
  // Get dividend and price data sorted chronologically
  const tickerDivPriceData = getDividendPriceData(ticker, date);
  const sortedDates = Object.keys(tickerDivPriceData).sort();

  // Reinvest dividends to calculate adjusted quantity
  for (const dateKey of sortedDates) {
    const { dividend, price } = tickerDivPriceData[dateKey];
    const cashReturns = parseFloat(dividend) * newQuantity;
    newQuantity += cashReturns / parseFloat(price);
  }

  return newQuantity;
}
