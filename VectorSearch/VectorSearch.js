const axios = require('axios');
const MongoClient = require('mongodb').MongoClient;

async function getEmbedding(query) {
    // Define the OpenAI API url and key.
    // const url = 'https://api.openai.com/v1/embeddings';
    // const openai_key = ''; // Replace with your OpenAI key.
    
    // Call OpenAI API to get the embeddings.
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
    const url = 'mongodb+srv://AdminCluster:India123@testcluster.n2msm.mongodb.net/?retryWrites=true&w=majority&appName=TestCluster'; // Replace with your MongoDB url.
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

async function main() {
    const query = 'Ramesh'; // Replace with your query.
    
    try {
        const embedding = await getEmbedding(query);
        console.log(embedding);
        const documents = await findSimilarDocuments(embedding);
        
       console.log(documents);
    } catch(err) {
        console.error(err);
    }
}

main();