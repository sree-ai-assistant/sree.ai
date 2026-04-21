const pdf = require('pdf-parse');
console.log('Type of pdf:', typeof pdf);
console.log('pdf properties:', Object.keys(pdf));
console.log('pdf.default type:', typeof pdf.default);
if (typeof pdf.default === 'function') {
    console.log('pdf.default is a function');
}
