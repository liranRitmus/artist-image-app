require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Credit Schema
const creditSchema = new mongoose.Schema({
  artist: String,
  attribution: String,
  url: String,
  thumbnail: String,
  query: String,
  createdAt: { type: Date, default: Date.now }
});

const Credit = mongoose.model('Credit', creditSchema, 'credits');

// Routes
// Add credit
app.post('/api/credits', async (req, res) => {
  try {
    const { artist, attribution, url, thumbnail, query } = req.body;
    
    // Check if credit already exists
    const exists = await Credit.findOne({ url, attribution });
    if (exists) {
      return res.status(400).json({ message: 'This image is already in your credits' });
    }

    const newCredit = new Credit({ artist, attribution, url, thumbnail, query });
    await newCredit.save();
    res.status(201).json(newCredit);
  } catch (error) {
    res.status(500).json({ message: error.message });
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

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
