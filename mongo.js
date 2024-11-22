const { MongoClient } = require('mongodb');

// MongoDB connection URL and Database Name
const MONGO_URI = 'mongodb://localhost:27017'; // Replace with your MongoDB connection string
const DB_NAME = 'embedding_database'; // Replace with your database name

// Function to connect to MongoDB
async function connect() {
    const client = new MongoClient(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        await client.connect();
        console.log('Connected to MongoDB');
        const db = client.db(DB_NAME); // Get the specific database
        return db.collection('embeddings'); // Return the 'embeddings' collection
    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw error;
    }
}

module.exports = connect;
