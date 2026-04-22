const pdf = require('pdf-parse');
console.log('Type of require(pdf-parse):', typeof pdf);
if (typeof pdf === 'function') {
  console.log('require(pdf-parse) is a function');
} else {
  console.log('require(pdf-parse) keys:', Object.keys(pdf));
}
