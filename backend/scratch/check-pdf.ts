import * as pdf from 'pdf-parse';
console.log('Type of pdf:', typeof pdf);
console.log('Keys of pdf:', Object.keys(pdf || {}));
if (typeof pdf === 'function') {
  console.log('pdf is a function');
} else if (pdf && (pdf as any).default) {
  console.log('pdf has a default property which is a:', typeof (pdf as any).default);
}
