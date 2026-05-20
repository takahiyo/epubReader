const fs = require('fs');
const html = fs.readFileSync('n7787eq.html', 'utf8');

const regex = /<([^>]+)>\s*<a[^>]+href="(\/n7787eq\/\d+\/)"[^>]*>([\s\S]*?)<\/a>/gi;
let match;
let count = 0;
while ((match = regex.exec(html)) !== null && count < 5) {
    console.log(`Parent Tag: ${match[1]}`);
    console.log(`Href: ${match[2]}`);
    console.log(`Text: ${match[3].replace(/<[^>]+>/g, '').trim()}`);
    console.log('---');
    count++;
}
