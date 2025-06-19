import express from 'express';
import puppeteer from 'puppeteer';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.post('/analyze', async (req, res) => {
  const { url } = req.body;
  
  let browser;
  try {
    console.log(`Analyzing: ${url}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate to the page
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Wait a bit for CMP scripts to load
    await page.waitForTimeout(5000);
    
    // Execute analysis in browser context
    const results = await page.evaluate(() => {
      return new Promise((resolve) => {
        const analysis = {
          sourcepointConfig: null,
          localStorage: {},
          tcfData: null,
          tcfAvailable: false,
          timestamp: new Date().toISOString()
        };
        
        // Check for Sourcepoint configuration
        if (window._sp_ && window._sp_.config) {
          analysis.sourcepointConfig = {
            ...window._sp_.config,
            source: 'browser_automation_window_sp'
          };
        }
        
        // Check localStorage for CMP data
        try {
          const localStorage = window.localStorage;
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('_sp_') || key.includes('consent') || key.includes('tcf'))) {
              analysis.localStorage[key] = localStorage.getItem(key);
            }
          }
        } catch (e) {
          console.log('LocalStorage access blocked');
        }
        
        // Check TCF API
        if (typeof window.__tcfapi === 'function') {
          analysis.tcfAvailable = true;
          window.__tcfapi('getTCData', 2, (tcData, success) => {
            if (success) {
              analysis.tcfData = tcData;
            }
            resolve(analysis);
          });
        } else {
          resolve(analysis);
        }
      });
    });
    
    console.log('Analysis complete:', {
      hasSourcepoint: !!results.sourcepointConfig,
      tcfAvailable: results.tcfAvailable,
      localStorageKeys: Object.keys(results.localStorage).length
    });
    
    res.json({ success: true, data: results });
    
  } catch (error) {
    console.error('Browser analysis failed:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`CMP Browser Service running on port ${PORT}`);
});
