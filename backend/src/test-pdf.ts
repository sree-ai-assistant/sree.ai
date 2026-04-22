import * as pdf from 'pdf-parse';

async function test() {
  try {
    const buffer = Buffer.from([37, 80, 68, 70]); 
    const data = await (pdf as any)(buffer);
    console.log('Text:', data.text);
  } catch (e: any) {
    console.log('Error:', e.message);
  }
}
test();
