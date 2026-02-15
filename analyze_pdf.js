const fs = require('fs');
const pdf = require('pdf-parse');

const dataBuffer = fs.readFileSync('/home/erstome/stocks_app/Extrato de conta.pdf');

// Handle CommonJS/ESM mismatch if any
let parse = pdf;
if (typeof pdf !== 'function' && typeof pdf.default === 'function') {
    parse = pdf.default;
}

parse(dataBuffer).then(function (data) {
    console.log('Number of pages:', data.numpages);
    console.log('Info:', data.info);
    console.log('------------------ TEXT CONTENT ------------------');
    console.log(data.text);
    console.log('--------------------------------------------------');
}).catch(err => {
    console.error('Error parsing PDF:', err);
});
