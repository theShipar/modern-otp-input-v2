const fs=require('node:fs');fs.mkdirSync('dist',{recursive:true});for(const file of ['index.html','otp-v2.css','otp-v2.js'])fs.copyFileSync(file,'dist/'+file);console.log('Built dist/');
