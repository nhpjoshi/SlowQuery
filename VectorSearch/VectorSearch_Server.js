const express = require('express');
const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;

const app = express();
const port = 3000; // Choose any port you like

app.use(express.json());

async function getEmbedding(query) {
  //  Define the OpenAI API url and key.
    const url = 'https://api.openai.com/v1/embeddings';
    const openai_key = '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'; // Replace with your OpenAI key.
    
    // Call OpenAI API to get the embeddings

    let response = await axios.post(url, {
        input: query,
        model: "text-embedding-ada-002"
    }, {
        headers: {
            'Authorization': `Bearer ${openai_key}`,
            'Content-Type': 'application/json'
        }
    });
    
    if(response.status === 200) {
        return response.data.data[0].embedding;
    } else {
        throw new Error(`Failed to get embedding. Status code: ${response.status}`);
    }
}

async function findSimilarDocuments(embedding) {
    const url = 'mongodb+srv://AdminCluster:India2024@testcluster.n2msm.mongodb.net/?retryWrites=true&w=majority&appName=TestCluster'; // Replace with your MongoDB url.
    const client = new MongoClient(url);
    
    try {
        await client.connect();
        
        const db = client.db('sample_mflix'); // Replace with your database name.
        const collection = db.collection('embedded_movies'); // Replace with your collection name.
        
        // Query for similar documents.
        const documents = await collection.aggregate([
  {"$vectorSearch": {
    "queryVector": embedding,
    "path": "plot_embedding",
    "numCandidates": 100,
    "limit": 5,
    "index": "mflix_index",
      }}
]).toArray();
        
        return documents;
    } finally {
        await client.close();
    }
}

app.post('/query', async (req, res) => {
    const query = req.body.query;
    
    try {
        const embedding = await getEmbedding(query);
        const documents = await findSimilarDocuments(embedding);
        
        res.json(documents);
    } catch(err) {
        console.error(err);
        res.status(500).send('Internal Server Error');
    }
});

app.listen(port, () => {
    console.log(`Server is listening at http://localhost:${port}`);
});
