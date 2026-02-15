const pdf = require('pdf-parse');
console.log('Type of export:', typeof pdf);
console.log('Export value:', pdf);
try {
    console.log('Keys:', Object.keys(pdf));
} catch (e) { }
