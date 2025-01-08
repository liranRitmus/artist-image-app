const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');
const archiver = require('archiver');
const axios = require('axios');
const path = require('path');

const app = express();
const SALT_ROUNDS = 12;

// Password Schema
const passwordSchema = new mongoose.Schema({
  hash: String
});
const Password = mongoose.model('Password', passwordSchema);

// API Key Schema
const apiKeySchema = new mongoose.Schema({
  key: String,
  updatedAt: { type: Date, default: Date.now }
});
const ApiKey = mongoose.model('ApiKey', apiKeySchema);

// Initialize password and API key if not exists
async function initializePassword() {
  const existingPassword = await Password.findOne();
  if (!existingPassword) {
    const hash = await bcrypt.hash('OP748748!', SALT_ROUNDS);
    await Password.create({ hash });
  }
  
  const existingApiKey = await ApiKey.findOne();
  if (!existingApiKey) {
    await ApiKey.create({ key: 'rCrDd2QB2rhBCU1HKI7AYhQsGzCpMt' });
  }
}

// Debug environment variables
console.log('Environment Variables:');
console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('PORT:', process.env.PORT);

// Middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Permissions-Policy', 'browsing-topics=(), private-state-token-redemption=(), private-state-token-issuance=()');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  retryWrites: true,
  w: 'majority'
})
.then(() => console.log('Successfully connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB');
});

mongoose.connection.on('error', (err) => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from DB');
});

// Credit Schema
const creditSchema = new mongoose.Schema({
  artist: String,
  attribution: String,
  url: String,
  thumbnail: String,
  query: String,
  license_url: String,
  createdAt: { type: Date, default: Date.now }
});

const Credit = mongoose.model('Credit', creditSchema, 'credits');

// Routes
// Add credit
app.post('/api/credits', async (req, res) => {
  try {
    const { artist, attribution, url, thumbnail, query, license_url } = req.body;
    
    // Validate required fields
    if (!artist || !attribution || !url) {
      return res.status(400).json({ 
        success: false,
        message: 'Artist, attribution, and URL are required fields'
      });
    }

    // Check if artist already exists
    const existingArtist = await Credit.findOne({ query });
    if (existingArtist) {
      return res.status(200).json({ 
        success: false,
        message: 'Artist already exists',
        existing: true,
        existingId: existingArtist._id
      });
    }

    const newCredit = new Credit({ artist, attribution, url, thumbnail, query, license_url });
    await newCredit.save();
    
    res.status(201).json({
      success: true,
      data: newCredit
    });
  } catch (error) {
    console.error('Error adding credit:', error);
    res.status(500).json({ 
      success: false,
      message: 'Server error while adding credit',
      error: error.message 
    });
  }
});

// Get all credits
app.get('/api/credits', async (req, res) => {
  try {
    const credits = await Credit.find().sort({ createdAt: -1 });
    res.json(credits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update credit title
app.put('/api/credits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { query } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid credit ID format' });
    }

    const updatedCredit = await Credit.findByIdAndUpdate(
      id,
      { query },
      { new: true }
    );
    
    if (!updatedCredit) {
      return res.status(404).json({ message: 'Credit not found' });
    }
    
    res.json({
      success: true,
      credit: updatedCredit
    });
  } catch (error) {
    console.error('Error updating credit:', error);
    res.status(500).json({ 
      message: 'Error updating credit',
      error: error.message 
    });
  }
});

// Delete a credit
app.delete('/api/credits/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`Attempting to delete credit with ID: ${id}`);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log(`Invalid ID format: ${id}`);
      return res.status(400).json({ message: 'Invalid credit ID format' });
    }

    const deletedCredit = await Credit.findByIdAndDelete(id);
    
    if (!deletedCredit) {
      console.log(`Credit not found with ID: ${id}`);
      return res.status(404).json({ message: 'Credit not found' });
    }
    
    console.log(`Successfully deleted credit with ID: ${id}`);
    res.json({ message: 'Credit deleted successfully' });
  } catch (error) {
    console.error('Error deleting credit:', error);
    res.status(500).json({ 
      message: 'Error deleting credit',
      error: error.message 
    });
  }
});

// Password verification endpoint
app.post('/api/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ 
        success: false,
        message: 'Password is required'
      });
    }

    const storedPassword = await Password.findOne().exec();
    if (!storedPassword) {
      console.error('No password found in database');
      return res.status(500).json({ 
        success: false,
        message: 'Password not configured'
      });
    }
    console.log('Found stored password hash');

    const isMatch = await bcrypt.compare(password, storedPassword.hash);
    res.json({
      success: isMatch,
      message: isMatch ? 'Password verified' : 'Incorrect password'
    });
  } catch (error) {
    console.error('Error verifying password:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error verifying password'
    });
  }
});

// Initialize password and start server
const PORT = process.env.PORT || 3001;
mongoose.connection.once('open', async () => {
  try {
    await initializePassword();
    console.log('Password initialized');
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize password:', error);
    process.exit(1);
  }
});

// Get API Key
app.get('/api/settings/apikey', async (req, res) => {
  try {
    const apiKey = await ApiKey.findOne();
    if (!apiKey) {
      return res.status(404).json({ 
        success: false,
        message: 'API key not found'
      });
    }
    res.json({
      success: true,
      key: apiKey.key
    });
  } catch (error) {
    console.error('Error getting API key:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error retrieving API key'
    });
  }
});

// Update API Key
app.post('/api/settings/apikey', async (req, res) => {
  try {
    const { key } = req.body;
    if (!key) {
      return res.status(400).json({ 
        success: false,
        message: 'API key is required'
      });
    }

    const apiKey = await ApiKey.findOne();
    if (apiKey) {
      apiKey.key = key;
      apiKey.updatedAt = new Date();
      await apiKey.save();
    } else {
      await ApiKey.create({ key });
    }

    res.json({
      success: true,
      message: 'API key updated successfully'
    });
  } catch (error) {
    console.error('Error updating API key:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating API key'
    });
  }
});

const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const rmdir = promisify(fs.rmdir);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);

// Export full CSV with images
app.get('/api/credits/export-full', async (req, res) => {
  // Create unique temp directory
  const tempDir = path.join(os.tmpdir(), `credits_export_${Date.now()}`);
  const imagesDir = path.join(tempDir, 'images');
  
  // Track response state
  let headersSent = false;
  let responseEnded = false;
  
  try {
    console.log('Creating temp directories:', tempDir);
    await mkdir(tempDir, { recursive: true });
    await mkdir(imagesDir, { recursive: true });

    // Verify directories were created
    try {
      await access(tempDir, fs.constants.W_OK);
      await access(imagesDir, fs.constants.W_OK);
    } catch (err) {
      throw new Error(`Failed to create/access temp directories: ${err.message}`);
    }

    const credits = await Credit.find().sort({ createdAt: -1 });
    console.log(`Found ${credits.length} credits to export`);
    
    if (credits.length === 0) {
      await cleanup();
      return res.status(404).json({ message: 'No credits to export' });
    }

    // Create CSV content
    const csvRows = [['Name', 'Image Path', 'Attribution']];
    let successfulDownloads = 0;
    let lastResponse = null;
    
    // Download images to temp directory
    for (const credit of credits) {
      try {
        // Download image with retries
        let imageData;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
          try {
            console.log(`Downloading ${credit.url}`);
            lastResponse = await axios({
              method: 'get',
              url: credit.url,
              responseType: 'arraybuffer',
              timeout: 30000,
              maxContentLength: 50 * 1024 * 1024,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
              }
            });

            if (lastResponse.status === 200 && lastResponse.data) {
              imageData = lastResponse.data;
              console.log(`Downloaded ${credit.artist} (${imageData.length} bytes)`);
              break;
            }
            throw new Error(`Invalid response: ${lastResponse.status}`);
          } catch (err) {
            attempts++;
            console.log(`Download attempt ${attempts} failed:`, err.message);
            if (attempts === maxAttempts) throw err;
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }

        // Format filename
        const formattedName = credit.artist.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        
        // Get extension from content type or URL
        let ext = '.jpg';
        if (lastResponse.headers['content-type'] && lastResponse.headers['content-type'].startsWith('image/')) {
          ext = '.' + lastResponse.headers['content-type'].split('/')[1].split(';')[0].toLowerCase();
        } else if (credit.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          ext = credit.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)[0].toLowerCase();
        }
        
        const imageName = `${formattedName}${ext}`;
        const imagePath = path.join(imagesDir, imageName);

        // Save image to temp directory
        console.log(`Writing ${imagePath}`);
        await writeFile(imagePath, imageData);
        console.log(`Saved ${imageName}`);

        csvRows.push([
          credit.query,
          `images/${imageName}`,
          credit.attribution
        ]);

        successfulDownloads++;
        console.log(`Processed ${successfulDownloads}/${credits.length}`);

      } catch (error) {
        console.error(`Failed to process ${credit.artist}:`, error.message);
        csvRows.push([
          credit.query,
          `Error: ${error.message}`,
          credit.attribution
        ]);
      }
    }

    // Save CSV file
    console.log('Creating CSV file');
    const csvContent = csvRows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const csvPath = path.join(tempDir, 'credits.csv');
    await writeFile(csvPath, csvContent);
    console.log('CSV file created');

    // Create zip file
    console.log('Creating zip archive');
    const archive = archiver('zip', {
      zlib: { level: 1 } // Fastest compression
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      throw err;
    });

    archive.on('warning', (err) => {
      console.warn('Archive warning:', err);
    });

    // Set headers
    res.attachment('credits-with-images.zip');
    headersSent = true;

    // Pipe archive data to response
    archive.pipe(res);

    // Add entire temp directory to zip
    archive.directory(tempDir, false);

    // Finalize archive
    console.log('Finalizing archive');
    await archive.finalize();
    
    console.log(`Export complete: ${successfulDownloads}/${credits.length} successful`);

    // Clean up temp directory after response is sent
    res.on('finish', () => {
      responseEnded = true;
      cleanup();
    });

  } catch (error) {
    console.error('Export error:', error);
    await cleanup();
    
    if (!headersSent && !responseEnded) {
      res.status(500).json({ 
        message: 'Export failed', 
        error: error.message,
        details: error.stack
      });
    } else if (!responseEnded) {
      res.end();
    }
  }

  // Cleanup function
  async function cleanup() {
    try {
      console.log('Starting cleanup');
      
      // Check if directories exist
      try {
        await access(imagesDir, fs.constants.F_OK);
        // Read all files in images directory
        const files = await readdir(imagesDir);
        
        // Delete each file
        for (const file of files) {
          const filePath = path.join(imagesDir, file);
          console.log(`Deleting file: ${filePath}`);
          await unlink(filePath);
        }
        
        // Remove images directory
        console.log(`Removing directory: ${imagesDir}`);
        await rmdir(imagesDir);
      } catch (err) {
        console.log('Images directory already cleaned up or not found');
      }
      
      // Remove temp directory
      try {
        await access(tempDir, fs.constants.F_OK);
        console.log(`Removing directory: ${tempDir}`);
        await rmdir(tempDir);
      } catch (err) {
        console.log('Temp directory already cleaned up or not found');
      }
      
      console.log('Cleanup completed');
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  }
});

// Export the app for Vercel
