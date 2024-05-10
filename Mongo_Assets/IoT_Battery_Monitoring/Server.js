
const express = require('express');
const bodyParser = require('body-parser');
const MongoClient = require('mongodb').MongoClient;

const app = express();
const port = 3000;

// Connection URL
const url = 'mongodb+srv://AdminCluster:India2024@testcluster.n2msm.mongodb.net/?retryWrites=true&w=majority&appName=TestCluster';
const dbName = 'BatteryMonitoring';
const collectionName = 'Battery';

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Route to insert time-series data
app.post('/insert', async (req, res) => {
    try {
        const client = await MongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true });
        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        const { timestamp, Analog_Value , Output_Voltage, Battery_Percentage , meta } = req.body;

        // Insert the time-series document
       // console.log('Inserting time-series data:', timestamp, value);
        await collection.insertOne({
            TimeStamp: new Date(timestamp),
            Analog_Value: Analog_Value , 
            Output_Voltage: Output_Voltage,
            Battery_Percentage: Battery_Percentage,
            meta: meta
        });

        client.close();

        res.status(201).send('Time-series data inserted successfully');
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal server error');
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
