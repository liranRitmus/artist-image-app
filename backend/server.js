const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const SALT_ROUNDS = 12;

// Password Schema
const passwordSchema = new mongoose.Schema({
  hash: String
});
const Password = mongoose.model('Password', passwordSchema);

// Initialize password if not exists
async function initializePassword() {
  const existingPassword = await Password.findOne();
  if (!existingPassword) {
    const hash = await bcrypt.hash('OP748748!', SALT_ROUNDS);
    await Password.create({ hash });
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

    const storedPassword = await Password.findOne();
    if (!storedPassword) {
      return res.status(500).json({ 
        success: false,
        message: 'Password not configured'
      });
    }

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
app.listen(PORT, async () => {
  await initializePassword();
  console.log(`Server running on port ${PORT}`);
});

// Export the app for Vercel
module.exports = app;
