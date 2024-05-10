
const MongoClient = require('mongodb').MongoClient;

// Connection URL
const url = 'mongodb+srv://AdminCluster:India2024@testcluster.n2msm.mongodb.net/?retryWrites=true&w=majority&appName=TestCluster';
const dbName = 'BatteryMonitoring';
const collectionName = 'Battery';

// Sample time-series data
const sampleData = [
    { TimeStamp: new Date('2024-05-05T00:00:00Z'), value: 10 },
    { TimeStamp: new Date('2024-05-05T01:00:00Z'), value: 20 },
    { TimeStamp: new Date('2024-05-05T02:00:00Z'), value: 30 },
    // Add more sample data as needed
];

async function insertSampleData() {
    try {
        // Connect to MongoDB
        const client = await MongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Insert sample data
        await collection.insertMany(sampleData);

        console.log('Sample data inserted successfully');

        client.close();
    } catch (error) {
        console.error('Error inserting sample data:', error);
    }
}

// Call the function to insert sample data
insertSampleData();
