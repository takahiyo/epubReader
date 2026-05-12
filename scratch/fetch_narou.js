const fs = require('fs');
const https = require('https');

// リダイレクト先のURL
const url = 'https://api.codetabs.com/v1/proxy/?quest=https://ncode.syosetu.com/n7787eq/';

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    fs.writeFileSync('codetabs_narou.html', data);
    console.log(`Saved to codetabs_narou.html (${data.length} bytes)`);
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
