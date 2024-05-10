db.products.insertMany( [
   { name: "Shakir", location: "Ottawa",    region: "AMER", joined: 2015 },
   { name: "Chris",  location: "Austin",    region: "AMER", joined: 2016 },
   { name: "III",    location: "Sydney",    region: "APAC", joined: 2016 },
   { name: "Miguel", location: "Barcelona", region: "EMEA", joined: 2017 },
   { name: "Alex",   location: "Toronto",   region: "AMER", joined: 2018 }
   ] );



//   (E → S) Equality before Sort
// 5 Doc Scan
db.products.createIndex({ name: 1, region: 1 })
db.products.find({ region: "AMER" }).sort({ name: 1 })
db.products.find({ region: "AMER" }).sort({ name: 1 }).explain("executionStats").executionStats
//3 Docscal
db.products.createIndex({ region: 1, name: 1 })
db.products.find({ region: "AMER" }).sort({ name: 1 })
db.products.find({ region: "AMER" }).sort({ name: 1 }).explain("executionStats").executionStats




//(E → R) Equality before Range
//3 Scan
db.products.createIndex({ joined: 1, region: 1 })
db.products.find({ region: "AMER", joined: { $gt: 2015 } })
db.products.find({ region: "AMER", joined: { $gt: 2015 } }).explain("executionStats").executionStats
//2 Scan
db.products.createIndex({ region: 1, joined: 1 })
db.products.find({ region: "AMER", joined: { $gt: 2015 } })
db.products.find({ region: "AMER", joined: { $gt: 2015 } }).explain("executionStats").executionStats


//(S → R) Sort before Rannge

db.products.createIndex({ joined: 1, region: 1 })
db.products.find({ joined: { $gt: 2015 } }).sort({ region: 1 })
db.products.find({ joined: { $gt: 2015 } }).sort({ region: 1 }).explain("executionStats").executionStats


db.products.createIndex({ region: 1, joined: 1 })
db.products.find({ joined: { $gt: 2015 } }).sort({ region: 1 })
db.products.find({ joined: { $gt: 2015 } }).sort({ region: 1 }).explain("executionStats").executionStats