const fs = require('fs');
const https = require('https');

const options = {
  hostname: 'ncode.syosetu.com',
  port: 443,
  path: '/n7787eq/',
  method: 'GET',
  headers: {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    fs.writeFileSync('n7787eq_mobile.html', data);
    console.log(`Saved to n7787eq_mobile.html (${data.length} bytes)`);
  });
});

req.on('error', (err) => {
  console.error('Error:', err.message);
});
req.end();
