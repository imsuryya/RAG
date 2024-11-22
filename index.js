// index.js
require('dotenv').config();  // Load environment variables

const axios = require('axios');
const readline = require('readline');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { JSDOM } = require('jsdom');
const { connectToDatabase, storeEmbeddings, findSimilarEmbeddings } = require('./mongo');

// Load environment variables from .env
const JINA_AUTH_TOKEN = process.env.JINA_AUTH_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// MongoDB settings
const MONGO_URI = process.env.MONGO_URI;
const DATABASE_NAME = process.env.DATABASE_NAME;
const COLLECTION_NAME = process.env.COLLECTION_NAME;

// System Prompt Template
const SYSTEM_PROMPT = `You are a knowledgeable assistant designed to answer user questions accurately and concisely by utilizing retrieved documents.
*DOCUMENT:* {document}
---*QUESTION:* {question}
---*INSTRUCTIONS:*
- Answer the user's question using the information from the document above
- Ensure your response is factual, specific, and relevant to the question
- Keep your answer clear and concise, ideally within 2-3 sentences`;

async function fetchContent(url = null) {
    if (!url) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        url = await new Promise(resolve => rl.question('Enter the URL to fetch content: ', resolve));
        rl.close();
    }
    if (!url.startsWith("http")) {
        console.log("Invalid URL.");
        return null;
    }
    try {
        console.log(`Fetching content from: ${url}`);
        const fetch = (await import('node-fetch')).default;
        const response = await fetch(`https://r.jina.ai/${url}`, {
            method: 'GET',
            headers: { 'Authorization': JINA_AUTH_TOKEN }
        });
        const contentType = response.headers.get('content-type');
        let data;
        if (contentType.includes('application/json')) {
            data = await response.json();
        } else if (contentType.includes('text/html')) {
            const text = await response.text();
            const dom = new JSDOM(text);
            data = dom.window.document.body.textContent;
        } else {
            data = await response.text();
        }
        console.log("Content fetched successfully.");
        return data;
    } catch (error) {
        console.log(`Error fetching content: ${error.message}`);
        return null;
    }
}

async function segmentText(content = null) {
    if (!content) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        content = await new Promise(resolve => rl.question('Enter the text to segment: ', resolve));
        rl.close();
    }
    if (typeof content !== 'string') {
        content = JSON.stringify(content);
    }
    if (!content.trim()) {
        console.log("No text provided.");
        return null;
    }
    const requestData = {
        content: content,
        return_chunks: true,
        return_tokens: true,
        max_chunk_length: 1500
    };
    try {
        console.log("Attempting to segment text...");
        const fetch = (await import('node-fetch')).default;
        const response = await fetch('https://segment.jina.ai/', {
            method: 'POST',
            headers: { 'Authorization': JINA_AUTH_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        const data = await response.json();
        console.log("Text segmentation successful.");
        return data;
    } catch (error) {
        console.log(`Error segmenting text: ${error.message}`);
        return null;
    }
}

async function generateEmbeddings(inputs = []) {
    if (!inputs || inputs.length === 0) {
        console.log("No inputs provided for embedding generation.");
        return null;
    }
    const stringInputs = inputs.map(item => {
        if (typeof item === 'string') {
            return item.substring(0, 1000);
        } else if (typeof item === 'object' && item.text) {
            return item.text.substring(0, 1000);
        } else {
            return JSON.stringify(item).substring(0, 1000);
        }
    });
    const data = {
        model: "jina-clip-v2", 
        normalized: true,
        embedding_type: 'float',
        input: stringInputs.map(text => ({ text }))
    };
    try {
        console.log("Attempting to generate embeddings...");
        const response = await axios.post('https://api.jina.ai/v1/embeddings', data, { headers: { 'Authorization': JINA_AUTH_TOKEN, 'Content-Type': 'application/json' } });
        return response.data;
    } catch (error) {
        console.log(`Error generating embeddings: ${error.message}`);
        return null;
    }
}

async function generateGeminiResponse(document, question) {
    try {
        const formattedPrompt = SYSTEM_PROMPT.replace('{document}', JSON.stringify(document)).replace('{question}', question);
        const result = await geminiModel.generateContent(formattedPrompt);
        return result.response.text();
    } catch (error) {
        console.log(`Error generating Gemini response: ${error.message}`);
        return null;
    }
}

async function main() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    
    // Step 1: Fetch Content
    console.log("\n--- Step 1: Fetching Content ---");
    const url = await new Promise(resolve => rl.question('Enter the URL to fetch content: ', resolve));
    const fetchedContent = await fetchContent(url);
    if (!fetchedContent) {
        console.log("Content fetching failed. Exiting.");
        rl.close();
        return;
    }

    // Step 2: Segment Text
    console.log("\n--- Step 2: Segmenting Text ---");
    const segmentedContent = await segmentText(fetchedContent);
    if (!segmentedContent) {
        console.log("Text segmentation failed. Exiting.");
        rl.close();
        return;
    }

    // Step 3: Generate Embeddings
    console.log("\n--- Step 3: Generating Embeddings ---");
    const embeddingInputs = [segmentedContent];
    const embeddings = await generateEmbeddings(embeddingInputs);

    // Step 4: Generate Gemini Response
    console.log("\n--- Step 4: Generating AI Response ---");
    const userQuestion = await new Promise(resolve => rl.question('Ask a question about the fetched content: ', resolve));
    const geminiResponse = await generateGeminiResponse(segmentedContent, userQuestion);
    if (geminiResponse) {
        console.log("\n--- Gemini's Response ---");
        console.log(geminiResponse);
        console.log("\nWorkflow completed successfully!");
    } else {
        console.log("\nWorkflow encountered an error during AI response generation.");
    }

    rl.close();
}

main().catch(console.error);
