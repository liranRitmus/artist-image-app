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

// Export full CSV with images
app.get('/api/credits/export-full', async (req, res) => {
  // Set headers first
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename=credits-with-images.zip');
  
  const archive = archiver('zip', {
    store: true // Sets the compression method to STORE (no compression)
  });

  // Pipe archive data to the response
  const stream = archive.pipe(res);

  // Handle stream errors
  stream.on('error', (err) => {
    console.error('Stream error:', err);
    // Clean up
    archive.destroy();
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error during download' });
    } else {
      res.end();
    }
  });

  // Listen for archive errors
  archive.on('error', (err) => {
    console.error('Archive error:', err);
    // Clean up
    archive.destroy();
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error creating archive' });
    } else {
      res.end();
    }
  });

  // Listen for archive warnings
  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Archive warning:', err);
    } else {
      console.error('Archive warning:', err);
      archive.destroy();
      if (!res.headersSent) {
        res.status(500).json({ message: 'Archive warning' });
      } else {
        res.end();
      }
    }
  });

  try {
    const credits = await Credit.find().sort({ createdAt: -1 });
    
    if (credits.length === 0) {
      archive.destroy();
      return res.status(404).json({ message: 'No credits to export' });
    }

    // Create CSV content with local image paths
    const csvRows = [['Name', 'Image Path', 'Attribution']];
    
    // Download and add images to ZIP
    for (let i = 0; i < credits.length; i++) {
      const credit = credits[i];
      try {
        // Try to download with retries
        let imageResponse;
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
          try {
            imageResponse = await axios.get(credit.url, { 
              responseType: 'arraybuffer',
              timeout: 30000, // 30 second timeout
              maxContentLength: 50 * 1024 * 1024, // 50MB max
              validateStatus: status => status === 200,
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
              }
            });
            break; // Success, exit retry loop
          } catch (downloadError) {
            attempts++;
            if (attempts === maxAttempts) {
              throw new Error(
                downloadError.response
                  ? `HTTP ${downloadError.response.status}: ${downloadError.response.statusText}`
                  : downloadError.code === 'ECONNABORTED'
                  ? 'Timeout after 30 seconds'
                  : downloadError.message
              );
            }
            // Wait 2 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
        
        // Format artist name for filename (lowercase and replace spaces with underscores)
        const formattedName = credit.artist.toLowerCase().replace(/\s+/g, '_');
        
        // Get file extension from content-type or URL
        let ext = '.jpg';
        const contentType = imageResponse.headers['content-type'];
        if (contentType && contentType.startsWith('image/')) {
          ext = '.' + contentType.split('/')[1].split(';')[0].toLowerCase();
        } else if (credit.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          ext = credit.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)[0].toLowerCase();
        }
        
        const imageName = `${formattedName}${ext}`;
        
        // Add file to archive with proper options
        archive.append(Buffer.from(imageResponse.data), { 
          name: `images/${imageName}`,
          date: new Date(),
          mode: 0o644 // Proper file permissions
        });
        
        csvRows.push([
          credit.query,
          `images/${imageName}`,
          credit.attribution
        ]);
      } catch (error) {
        console.error(`Error downloading image for ${credit.query}:`, error);
        const errorMessage = error.message || 'Unknown error';
        csvRows.push([
          credit.query,
          `Error downloading: ${errorMessage}`,
          credit.attribution
        ]);
      }
    }

    // Add CSV file to ZIP
    const csvContent = csvRows
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    archive.append(csvContent, { 
      name: 'credits.csv',
      date: new Date(),
      mode: 0o644
    });

    // Finalize archive
    await archive.finalize();
    
    console.log('Archive created successfully');
  } catch (error) {
    console.error('Error creating export:', error);
    // Clean up
    archive.destroy();
    if (!res.headersSent) {
      res.status(500).json({ message: 'Error creating export' });
    } else {
      res.end();
    }
  }
});

// Export the app for Vercel
