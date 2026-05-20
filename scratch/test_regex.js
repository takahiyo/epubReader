const ncode = 'n7787eq';
const href = '/n7787eq/1/';

// パターン1: 現在のコード
const regex1 = new RegExp(`\/${ncode}\/(\\d+)\/?(?:$|\\?|#)`, 'i');
console.log('Regex1:', regex1);
console.log('Match1:', href.match(regex1));

// パターン2: 修正案
const regex2 = new RegExp(`\/${ncode}\/(\\d+)\\/?(?:$|\\?|#)`, 'i');
console.log('Regex2:', regex2);
console.log('Match2:', href.match(regex2));
