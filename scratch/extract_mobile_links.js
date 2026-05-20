const fs = require('fs');
const html = fs.readFileSync('n7787eq_mobile.html', 'utf8');
const regex = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
let m;
let count = 0;
while((m = regex.exec(html)) !== null && count < 10) {
    if (m[1].includes('n7787eq') || m[1].match(/^\/\d+\//) || m[1].includes('1/')) {
        console.log('Href:', m[1]);
        console.log('Text:', m[2].replace(/<[^>]+>/g, '').trim());
        console.log('---');
        count++;
    }
}
